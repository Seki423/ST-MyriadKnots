import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_THEME_SCHEMA_VERSION, CUSTOM_THEME_VARIABLES, createDefaultCustomThemeStore,
  createDynamicCustomThemePreset, createStaticCustomThemePreset, isSafeCustomThemeValue,
  normalizeCustomThemeStore, validateCustomThemePreset,
} from '../src/ui/theme-presets.js';
import { applyAppearance, resolveAppearance } from '../src/ui/appearance.js';
import { createSettingsStore } from '../src/settings.js';

const palette = {
  paper:'#f7f8fa',panel:'#ffffff',ink:'#22282b',soft:'#637077',faint:'#929da2',
  line:'#dce2e5',thread:'#cbd4d8',crimson:'#b63745',knot:'#b63745',
  onPrimary:'#fff',blue:'#3b706a',success:'#3d6f55',
};
const preset = (overrides = {}) => ({
  id:'theme-test',name:'测试主题',variables:{...palette,...overrides},
  createdAt:'2026-11-13T00:00:00.000Z',updatedAt:'2026-11-13T00:00:00.000Z',
});

test('支持静态颜色、宿主变量 fallback 与嵌套 color-mix，并拒绝危险 CSS', () => {
  for (const value of [
    '#abc','#abcd','#aabbcc','#aabbccdd','rgb(1, 2, 3)','rgba(1, 2, 3, .5)',
    'rgba(1 2 3 / .5)','hsl(210, 50%, 40%)','hsla(210, 50%, 40%, .8)',
    'var(--SmartThemeQuoteColor, #abc)',
    'var(--qqj-accent, var(--SmartThemeFoo, rgba(1, 2, 3, .5)))',
    'color-mix(in srgb, var(--SmartThemeQuoteColor, #abc) 70%, #123456)',
    'color-mix(in srgb, color-mix(in srgb, #fff 25%, #000) 60%, #abc)',
  ]) assert.equal(isSafeCustomThemeValue(value),true,value);
  for (const value of [
    'red','#12345','var(--SmartThemeQuoteColor)','var(--OtherColor, #fff)',
    'var(--SmartThemeA, var(--SmartThemeA, #fff))',
    'var(--SmartThemeA, color-mix(in srgb, #fff 50%, #000))',
    'url(a)','image-set(url(a) 1x)','attr(title)','expression(alert(1))',
    '#fff; color:red','#fff{}','#fff/*comment*/',
    'color-mix(in oklab, #fff 50%, #000)','color-mix(in srgb, #fff 120%, #000)',
    'color-mix(in srgb, black 50%, #000)',
  ]) assert.equal(isSafeCustomThemeValue(value),false,value);
  assert.equal(isSafeCustomThemeValue('var(--SmartThemeA, #' + 'a'.repeat(196) + ')'),false);
});

test('严格验证 12 个字段、onPrimary auto 以及 QQJ 别名循环', () => {
  const valid=validateCustomThemePreset(preset({paper:'var(--SmartThemeBlurTintColor, #f7f8fa)',onPrimary:'auto'}));
  assert.equal(valid.variables.onPrimary,'auto');
  assert.equal(CUSTOM_THEME_SCHEMA_VERSION,1);
  assert.throws(()=>validateCustomThemePreset(preset({paper:'url(a)'})),/paper/u);
  assert.throws(()=>validateCustomThemePreset({...preset(),variables:{...palette,extra:'#fff'}}),/不支持/u);
  assert.throws(()=>validateCustomThemePreset(preset({onPrimary:'var(--SmartThemeBodyColor, #fff)'})),/onPrimary/u);
  assert.throws(()=>validateCustomThemePreset(preset({knot:'var(--qqj-inline-knot, #b63745)'})),/循环/u);
});

test('持久化规范化按字段丢弃无效值及循环字段，不丢主题记录', () => {
  const store=normalizeCustomThemeStore({schemaVersion:1,activePresetId:'theme-test',items:[
    preset({paper:'url(a)',panel:'#fff; color:red',knot:'var(--Unknown, #fff)'})
  ]});
  assert.equal(store.items.length,1);
  assert.equal(store.activePresetId,'theme-test');
  assert.equal('paper' in store.items[0].variables,false);
  assert.equal('panel' in store.items[0].variables,false);
  assert.equal('knot' in store.items[0].variables,false);
  const cyclic=normalizeCustomThemeStore({schemaVersion:1,activePresetId:'cycle',items:[
    preset({id:'cycle',panel:'var(--qqj-color-accent, #fff)',knot:'var(--qqj-color-surface, #b63745)'})
  ]});
  assert.equal('panel' in cyclic.items[0].variables,false);
  assert.equal('knot' in cyclic.items[0].variables,false);
});

test('静态模板与动态跟随模板生成正确值', () => {
  const fixed=createStaticCustomThemePreset({name:'静态',palette,now:()=>1000,random:()=>.25});
  assert.deepEqual(Object.keys(fixed.variables),CUSTOM_THEME_VARIABLES);
  assert.ok(Object.values(fixed.variables).every(v=>!v.startsWith('var(')&&!v.startsWith('color-mix(')));
  const dynamic=createDynamicCustomThemePreset({name:'动态',palette,now:()=>1000,random:()=>.5});
  assert.equal(dynamic.variables.paper,'var(--SmartThemeBlurTintColor, #f7f8fa)');
  assert.equal(dynamic.variables.panel,'var(--SmartThemeChatTintColor, #ffffff)');
  assert.equal(dynamic.variables.ink,'var(--SmartThemeBodyColor, #22282b)');
  assert.equal(dynamic.variables.soft,'var(--SmartThemeEmColor, #637077)');
  assert.equal(dynamic.variables.line,'var(--SmartThemeBorderColor, #dce2e5)');
  assert.equal(dynamic.variables.knot,'var(--SmartThemeQuoteColor, #b63745)');
  assert.equal(dynamic.variables.onPrimary,'auto');
  for(const key of ['faint','thread','crimson','blue','success']) assert.equal(dynamic.variables[key],palette[key]);
});

test('settings 复用 extension_settings 持久化且兼容没有新字段的旧配置', () => {
  const extensionSettings={qianqianjie:{appearanceTheme:'day'}};
  let saves=0;
  const store=createSettingsStore({extensionSettings,save:()=>{saves+=1;},now:()=>1000,random:()=>.5});
  const reads=saves;
  assert.deepEqual(store.get().customThemeStore,createDefaultCustomThemeStore());
  assert.equal(saves,reads);
  const dynamic=createDynamicCustomThemePreset({name:'保存',palette,now:()=>1000,random:()=>.5});
  store.update({customThemeStore:{schemaVersion:1,activePresetId:dynamic.id,items:[dynamic]}});
  const restored=createSettingsStore({extensionSettings,save(){}});
  assert.equal(restored.get().customThemeStore.items[0].variables.paper,dynamic.variables.paper);
  assert.equal(restored.get().appearanceTheme,'day');
});

test('custom 主题逐字段采用 palette，无效字段回退对应 day/night 基色', () => {
  const active=preset({paper:'var(--SmartThemeBlurTintColor, #f7f8fa)',knot:'var(--SmartThemeQuoteColor, #b63745)',onPrimary:'auto',faint:'url(a)'});
  const value={appearanceTheme:'day',customThemeStore:{schemaVersion:1,activePresetId:active.id,items:[active]}};
  const day=resolveAppearance({value});
  assert.equal(day.palette.paper,active.variables.paper);
  assert.equal(day.palette.knot,active.variables.knot);
  assert.equal(day.palette.onPrimary,'auto');
  assert.equal(day.palette.faint,palette.faint);
  const night=resolveAppearance({value:{...value,appearanceTheme:'night'}});
  assert.equal(night.palette.faint,'#6c7c81');
});

test('日间/夜间基础模式下动态 SmartTheme 引用变化会重新计算 onPrimary', () => {
  let observerCallback = null, applied = 0;
  class Observer {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  }
  const documentRef = { documentElement: {}, createElement: () => ({ style: { setProperty() {} }, remove() {} }) };
  const windowRef = {
    MutationObserver: Observer,
    getComputedStyle: node => node === documentRef.documentElement
      ? { getPropertyValue: () => '' }
      : { color: applied === 0 ? '#ffffff' : '#22282b' },
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  };
  const active = preset({ knot: 'var(--SmartThemeQuoteColor, #b63745)', onPrimary: 'auto' });
  const settings = {
    get: () => ({
      appearanceTheme: 'day',
      customThemeStore: { schemaVersion: 1, activePresetId: active.id, items: [active] },
    }),
  };
  const properties = {};
  const host = {
    setAttribute() {},
    style: { setProperty(name, value) { properties[name] = value; } },
    appendChild(node) { node.parentNode = this; },
    removeChild(node) { node.parentNode = null; },
  };
  const controller = createAppearanceController({
    host, root: { querySelector: () => null }, settings, documentRef, windowRef,
    onChange: () => { applied += 1; },
  });
  const before = applied;
  observerCallback();
  assert.equal(applied, before + 1, 'manual day mode with SmartTheme var must re-apply on host root mutation');
  controller.destroy();
});

test('onPrimary auto probe 每 document 创建一次、读取 computed knot 后移除', () => {
  let created=0,appended=0,removed=0;
  const probe={style:{setProperty(){}},remove(){if(this.parentNode)this.parentNode.removeChild(this);}};
  const documentRef={documentElement:{},createElement(){created+=1;return probe;}};
  const windowRef={getComputedStyle(){return {color:'#ffffff'};},matchMedia(){return {matches:true};}};
  const makeHost=()=>{const properties={},children=new Set();return {
    properties,children,style:{setProperty(k,v){properties[k]=v;}},setAttribute(){},
    appendChild(node){appended+=1;node.parentNode=this;children.add(node);},
    removeChild(node){removed+=1;children.delete(node);node.parentNode=null;}
  };};
  const active=preset({onPrimary:'auto',knot:'var(--SmartThemeQuoteColor, #b63745)'});
  const settings={appearanceTheme:'day',customThemeStore:{schemaVersion:1,activePresetId:active.id,items:[active]}};
  const first=makeHost();
  assert.equal(applyAppearance({host:first,documentRef,windowRef,settings}).palette.onPrimary,'#22282b');
  assert.equal(first.properties['--on-primary'],'#22282b');
  assert.equal(first.children.size,0);
  const second=makeHost();
  applyAppearance({host:second,documentRef,windowRef,settings});
  assert.equal(created,1);assert.equal(appended,2);assert.equal(removed,2);
  assert.equal(second.children.size,0);
});
