import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_THEME_VARIABLES, createDynamicCustomThemePreset, isSafeHexThemeColor, validateCustomThemePreset } from '../src/ui/theme-presets.js';
import { THEME_FOLLOW_VARIABLES, THEME_STATIC_SEMANTIC_FIELDS, createThemePresetsSettings } from '../src/ui/settings/theme-presets-settings.js';
const palette={paper:'#f7f8fa',panel:'#ffffff',ink:'#22282b',soft:'#637077',faint:'#929da2',line:'#dce2e5',thread:'#cbd4d8',crimson:'#b63745',knot:'#b63745',onPrimary:'#fff',blue:'#3b706a',success:'#3d6f55'};
const makePreset=(overrides={})=>({id:'theme-1',name:'测试主题',variables:{...palette,...overrides},createdAt:'2026-11-13T00:00:00.000Z',updatedAt:'2026-11-13T00:00:00.000Z'});
class FakeElement{
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.listeners=new Map();this.attributes={};this.style={values:{},setProperty:(k,v)=>{this.style.values[k]=v;}};this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.className='';this.parentNode=null;}
 append(...nodes){for(const n of nodes){if(n){n.parentNode=this;this.children.push(n);}}}
 appendChild(n){this.append(n);return n;}
 replaceChildren(...nodes){for(const c of this.children)c.parentNode=null;this.children=[];this.append(...nodes);}
 remove(){if(!this.parentNode)return;this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
 addEventListener(type,fn){const b=this.listeners.get(type)??[];b.push(fn);this.listeners.set(type,b);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(x=>x!==fn));}
 setAttribute(k,v){this.attributes[k]=String(v);}
 focus(){this.ownerDocument.activeElement=this;}
 dispatch(type,extra={}){const e={type,target:this,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},stopImmediatePropagation(){this.immediateStopped=true;},...extra};for(const fn of this.listeners.get(type)??[])fn(e);return e;}
 querySelectorAll(selector){const cls=selector.startsWith('.')?selector.slice(1):null,out=[];const walk=n=>{for(const c of n.children){if(cls&&c.className.split(/\s+/u).includes(cls))out.push(c);walk(c);}};walk(this);return out;}
}
class FakeDocument{
 constructor(){this.activeElement=null;this.frames=new Map();this.cancelled=[];this.nextFrame=1;this.defaultView={requestAnimationFrame:cb=>{const id=this.nextFrame++;this.frames.set(id,cb);return id;},cancelAnimationFrame:id=>{this.cancelled.push(id);this.frames.delete(id);}};}
 createElement(tag){return new FakeElement(tag,this);}
 runFrames(){const entries=[...this.frames.entries()];this.frames.clear();for(const [,cb] of entries)cb();}
}
function setup(){
 const documentRef=new FakeDocument(),overlayRoot=new FakeElement('shadow-root',documentRef);let writes=0,previews=0,restores=0;
 const state={customThemeStore:{schemaVersion:1,activePresetId:null,items:[]}},settings={get:()=>state,update:p=>{writes++;Object.assign(state,p);}};
 let previewPalette={...palette};
 const appearance={getComputedPalette:()=>({...previewPalette}),getState:()=>({palette:{...palette}}),preview:()=>{previews++;previewPalette={...palette,paper:'#123456'};},restore:()=>{restores++;previewPalette={...palette};},apply(){}};
 const component=createThemePresetsSettings({settings,documentRef,appearance,overlayRoot,confirmImpl:async()=>true});
 return{documentRef,overlayRoot,component,state,get writes(){return writes;},get previews(){return previews;},get restores(){return restores;}};
}
const findButton=(root,label)=>{const q=[root];while(q.length){const n=q.shift();if(n.tagName==='BUTTON'&&n.textContent===label)return n;q.push(...n.children);}return null;};

test('动态模板只跟随中性表面 / 文字字段，语义色固定 HEX',()=>{
 const dynamic=createDynamicCustomThemePreset({name:'跟随',palette});
 assert.deepEqual(THEME_STATIC_SEMANTIC_FIELDS,['crimson','blue','success']);
 for(const key of THEME_STATIC_SEMANTIC_FIELDS){assert.equal(isSafeHexThemeColor(dynamic.variables[key]),true);assert.equal(dynamic.variables[key].startsWith('var('),false);}
 for(const key of Object.keys(THEME_FOLLOW_VARIABLES))assert.match(dynamic.variables[key],/^var\(--SmartTheme/u);
 for(const key of THEME_STATIC_SEMANTIC_FIELDS)assert.throws(()=>validateCustomThemePreset(makePreset({[key]:'var(--SmartThemeQuoteColor, #b63745)'})),/静态 HEX/u);
 assert.equal(CUSTOM_THEME_VARIABLES.length,12);
});
test('编辑器使用 RAF 合并预览，关闭时取消待执行帧且不写设置',()=>{
 const f=setup();f.component.node.children[2].children[0].dispatch('click');
 assert.equal(f.overlayRoot.children.length,1);assert.equal(f.writes,0);assert.equal(f.documentRef.frames.size,1);
 f.documentRef.runFrames();assert.equal(f.previews,1);
 const input=f.overlayRoot.querySelectorAll('.qqj-theme-color-input')[0];input.value='#112233';input.dispatch('input');
 const pending=[...f.documentRef.frames.keys()][0];findButton(f.overlayRoot,'取消').dispatch('click');
 assert.ok(f.documentRef.cancelled.includes(pending));assert.equal(f.overlayRoot.children.length,0);assert.equal(f.writes,0);assert.ok(f.restores>=1);
});
test('Escape 只关闭编辑器并阻止事件继续传播到面板',()=>{
 const f=setup();f.component.node.children[2].children[0].dispatch('click');const e=f.overlayRoot.dispatch('keydown',{key:'Escape'});
 assert.equal(e.defaultPrevented,true);assert.equal(e.propagationStopped,true);assert.equal(e.immediateStopped,true);
 assert.equal(f.overlayRoot.children.length,0);assert.equal(f.restores,1);assert.equal(f.writes,0);
});
test('保存并应用只写入一次设置，并激活新主题',()=>{
 const f=setup();f.component.node.children[2].children[0].dispatch('click');findButton(f.overlayRoot,'保存并应用').dispatch('click');
 assert.equal(f.writes,1);assert.ok(f.state.customThemeStore.activePresetId);assert.equal(f.state.customThemeStore.items.length,1);assert.equal(f.overlayRoot.children.length,0);
});

test('编辑非激活动态主题时，取色器显示该主题预览后的 computed color',()=>{
 const f=setup();
 f.state.customThemeStore.items.push(makePreset({paper:'var(--SmartThemeBlurTintColor, #f7f8fa)'}));
 f.component.refresh();
 findButton(f.component.node,'编辑').dispatch('click');
 f.documentRef.runFrames();
 const paper=f.overlayRoot.querySelectorAll('.qqj-theme-color-input')[0];
 assert.equal(paper.value,'#123456');
 assert.equal(f.state.customThemeStore.items[0].variables.paper,'var(--SmartThemeBlurTintColor, #f7f8fa)');
});
