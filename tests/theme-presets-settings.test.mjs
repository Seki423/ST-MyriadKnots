import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_THEME_VARIABLES, createDynamicCustomThemePreset, isSafeHexThemeColor,
  validateCustomThemePreset,
} from '../src/ui/theme-presets.js';
import {
  THEME_FOLLOW_VARIABLES, THEME_STATIC_SEMANTIC_FIELDS, createThemePresetsSettings,
} from '../src/ui/settings/theme-presets-settings.js';

const palette = {
  paper:'#f7f8fa', panel:'#ffffff', ink:'#22282b', soft:'#637077', faint:'#929da2',
  line:'#dce2e5', thread:'#cbd4d8', crimson:'#b63745', knot:'#b63745',
  onPrimary:'#fff', blue:'#3b706a', success:'#3d6f55',
};
const makePreset = ({id='theme-1',name='Test theme',variables={}}={}) => ({
  id, name, variables:{...palette,...variables},
  createdAt:'2026-11-13T00:00:00.000Z', updatedAt:'2026-11-13T00:00:00.000Z',
});
class FakeElement {
  constructor(tag,doc) {
    this.tagName=tag.toUpperCase(); this.ownerDocument=doc; this.children=[];
    this.listeners=new Map(); this.attributes={};
    this.style={values:{},setProperty:(key,value)=>{this.style.values[key]=value;}};
    this.dataset={}; this.hidden=false; this.disabled=false; this.value='';
    this.textContent=''; this.className=''; this.parentNode=null; this.type='';
  }
  append(...nodes) { for(const node of nodes) if(node){node.parentNode=this;this.children.push(node);} }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { for(const child of this.children) child.parentNode=null; this.children=[]; this.append(...nodes); }
  remove() { if(!this.parentNode)return; this.parentNode.children=this.parentNode.children.filter(child=>child!==this); this.parentNode=null; }
  addEventListener(type,callback) { const callbacks=this.listeners.get(type)??[]; callbacks.push(callback); this.listeners.set(type,callbacks); }
  removeEventListener(type,callback) { this.listeners.set(type,(this.listeners.get(type)??[]).filter(fn=>fn!==callback)); }
  setAttribute(key,value) { this.attributes[key]=String(value); }
  focus() { this.ownerDocument.activeElement=this; }
  dispatch(type,extra={}) {
    const event={type,target:this,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},stopImmediatePropagation(){this.immediateStopped=true;},...extra};
    for(const callback of this.listeners.get(type)??[]) callback(event);
    return event;
  }
  querySelectorAll(selector) {
    const className=selector.startsWith('.')?selector.slice(1):null,result=[];
    const visit=node=>{for(const child of node.children){if(className&&child.className.split(/\s+/u).includes(className))result.push(child);visit(child);}};
    visit(this); return result;
  }
}
class FakeDocument {
  constructor() {
    this.activeElement=null; this.frames=new Map(); this.cancelled=[]; this.nextFrame=1;
    this.defaultView={
      requestAnimationFrame:callback=>{const id=this.nextFrame++;this.frames.set(id,callback);return id;},
      cancelAnimationFrame:id=>{this.cancelled.push(id);this.frames.delete(id);},
    };
  }
  createElement(tag) { return new FakeElement(tag,this); }
  runFrames() { const queued=[...this.frames.entries()];this.frames.clear();for(const [,callback] of queued)callback(); }
}
function setup(initialStore={schemaVersion:1,activePresetId:null,items:[]}) {
  const documentRef=new FakeDocument(),overlayRoot=new FakeElement('shadow-root',documentRef);
  let writes=0,previews=0,restores=0,previewPalette={...palette};
  const state={customThemeStore:initialStore};
  const settings={get:()=>state,update:patch=>{writes++;Object.assign(state,patch);}};
  const appearance={
    getComputedPalette:()=>({...previewPalette}),getState:()=>({palette:{...palette}}),
    preview:()=>{previews++;previewPalette={...palette,paper:'#123456'};},
    restore:()=>{restores++;previewPalette={...palette};},apply(){},
  };
  const component=createThemePresetsSettings({settings,documentRef,appearance,overlayRoot,confirmImpl:async()=>true});
  return {documentRef,overlayRoot,component,state,get writes(){return writes;},get previews(){return previews;},get restores(){return restores;}};
}
const findButton=(root,label)=>{
  const queue=[root];
  while(queue.length){const node=queue.shift();if(node.tagName==='BUTTON'&&node.textContent===label)return node;queue.push(...node.children);}
  return null;
};
const openNew=fixture=>fixture.component.node.children[2].children[0].dispatch('click');

test('semantic status colors remain static HEX and are excluded from follow-host mappings',()=>{
  const dynamic=createDynamicCustomThemePreset({name:'Follow host',palette});
  assert.deepEqual(THEME_STATIC_SEMANTIC_FIELDS,['crimson','blue','success']);
  for(const key of THEME_STATIC_SEMANTIC_FIELDS){
    assert.equal(isSafeHexThemeColor(dynamic.variables[key]),true);
    assert.equal(dynamic.variables[key].startsWith('var('),false);
    assert.equal(Object.hasOwn(THEME_FOLLOW_VARIABLES,key),false);
    assert.throws(()=>validateCustomThemePreset(makePreset({variables:{[key]:'var(--SmartThemeQuoteColor, #b63745)'}})),/静态 HEX/u);
  }
  for(const key of Object.keys(THEME_FOLLOW_VARIABLES))assert.match(dynamic.variables[key],/^var\(--SmartTheme/u);
  assert.equal(CUSTOM_THEME_VARIABLES.length,12);
});

test('crimson, blue, and success editor rows expose a color picker but no follow-host button',()=>{
  const fixture=setup(); fixture.state.customThemeStore.items.push(makePreset()); fixture.component.refresh();
  findButton(fixture.component.node,'编辑').dispatch('click');
  const rows=fixture.overlayRoot.querySelectorAll('.qqj-theme-color-row');
  const labels={crimson:'\u5371\u9669\u8272',blue:'\u4fe1\u606f\u8272',success:'\u6210\u529f\u8272'};
  for(const [key,label] of Object.entries(labels)){
    const row=rows.find(item=>item.children[0]?.textContent===label);
    assert.ok(row,key+' editor row exists');
    assert.equal(row.children.filter(child=>child.tagName==='BUTTON').length,0,key+' has no follow-host action');
    assert.ok(row.children.some(child=>child.type==='color'),key+' keeps a color picker');
  }
});

test('preview is RAF scheduled and closing the editor cancels the pending frame without settings writes',()=>{
  const fixture=setup();openNew(fixture);
  assert.equal(fixture.overlayRoot.children.length,1);assert.equal(fixture.writes,0);assert.equal(fixture.documentRef.frames.size,1);
  fixture.documentRef.runFrames();assert.equal(fixture.previews,1);
  const input=fixture.overlayRoot.querySelectorAll('.qqj-theme-color-input')[0];input.value='#112233';input.dispatch('input');
  const pending=[...fixture.documentRef.frames.keys()][0];
  findButton(fixture.overlayRoot,'\u53d6\u6d88').dispatch('click');
  assert.ok(fixture.documentRef.cancelled.includes(pending));
  assert.equal(fixture.overlayRoot.children.length,0);assert.equal(fixture.writes,0);assert.ok(fixture.restores>=1);
});

test('Escape closes only the editor, restores the saved appearance, and stops propagation',()=>{
  const fixture=setup();openNew(fixture);
  const event=fixture.overlayRoot.dispatch('keydown',{key:'Escape'});
  assert.equal(event.defaultPrevented,true);assert.equal(event.propagationStopped,true);assert.equal(event.immediateStopped,true);
  assert.equal(fixture.overlayRoot.children.length,0);assert.equal(fixture.restores,1);assert.equal(fixture.writes,0);
});

test('save preserves the active preset while save-and-apply activates the new preset',()=>{
  const active=makePreset({id:'active',name:'Current'});
  const fixture=setup({schemaVersion:1,activePresetId:'active',items:[active]});
  openNew(fixture);findButton(fixture.overlayRoot,'\u4fdd\u5b58').dispatch('click');
  assert.equal(fixture.writes,1);assert.equal(fixture.state.customThemeStore.activePresetId,'active');
  assert.equal(fixture.state.customThemeStore.items.length,2);
  openNew(fixture);
  const name=fixture.overlayRoot.querySelectorAll('.qqj-theme-name-input')[0];name.value='Second theme';name.dispatch('input');
  findButton(fixture.overlayRoot,'\u4fdd\u5b58\u5e76\u5e94\u7528').dispatch('click');
  assert.equal(fixture.writes,2);assert.notEqual(fixture.state.customThemeStore.activePresetId,'active');
  assert.equal(fixture.state.customThemeStore.items.length,3);assert.equal(fixture.overlayRoot.children.length,0);
});

test('editing a non-active dynamic theme shows its computed color without rewriting its CSS expression',()=>{
  const fixture=setup();fixture.state.customThemeStore.items.push(makePreset({variables:{paper:'var(--SmartThemeBlurTintColor, #f7f8fa)'}}));
  fixture.component.refresh();findButton(fixture.component.node,'编辑').dispatch('click');fixture.documentRef.runFrames();
  const paper=fixture.overlayRoot.querySelectorAll('.qqj-theme-color-input')[0];
  assert.equal(paper.value,'#123456');
  assert.equal(fixture.state.customThemeStore.items[0].variables.paper,'var(--SmartThemeBlurTintColor, #f7f8fa)');
});

test('deleting the active preset clears its id and restores the base appearance',async()=>{
  const active=makePreset({id:'active',name:'Current'});
  const fixture=setup({schemaVersion:1,activePresetId:'active',items:[active]});
  findButton(fixture.component.node,'删除').dispatch('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fixture.state.customThemeStore.activePresetId,null);
  assert.equal(fixture.state.customThemeStore.items.length,0);assert.equal(fixture.restores,1);
});

test('导入 UI 在读取内容前拒绝超大文件，且不写设置',async()=>{
  const fixture=setup();
  const input=fixture.component.node.querySelectorAll('.qqj-theme-file-input')[0];
  let read=false;
  input.files=[{size:5*1024*1024,text:async()=>{read=true;return '{}';}}];
  input.dispatch('change');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(read,false,'超大文件不应被读入内存');
  assert.equal(fixture.writes,0);
  const feedback=fixture.component.node.querySelectorAll('.qqj-theme-feedback')[0];
  assert.match(feedback.textContent,/过大/u);
});
