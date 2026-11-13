import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_THEME_EXPORT_FORMAT,
  createCustomThemesExport,
  createCustomThemesFilename,
  downloadCustomThemesFile,
  importCustomThemesJson,
  MAX_THEME_IMPORT_BYTES,
  stringifyCustomThemesExport,
} from '../src/ui/theme-transfer.js';
import { MAX_CUSTOM_THEMES, validateCustomThemePreset } from '../src/ui/theme-presets.js';

const makeTheme = (id, name = id, variables = {}) => validateCustomThemePreset({
  id, name,
  variables: {
    paper:'#f7f8fa', panel:'#ffffff', ink:'#22282b', soft:'#637077', faint:'#929da2',
    line:'#dce2e5', thread:'#cbd4d8', crimson:'#b63745', knot:'#b63745',
    onPrimary:'#fff', blue:'#3b706a', success:'#3d6f55',
    ...variables,
  },
  createdAt:'2026-11-13T00:00:00.000Z',
  updatedAt:'2026-11-13T00:00:00.000Z',
});
const packageFor = items => JSON.stringify({
  format:CUSTOM_THEME_EXPORT_FORMAT,
  schemaVersion:1,
  exportedAt:'2026-11-13T03:00:00.000Z',
  items,
});
const emptyStore = () => ({schemaVersion:1,activePresetId:null,items:[]});

test('导出完整主题包：包含格式、版本、时间和全部主题',()=>{
  const first=makeTheme('one','第一套'),second=makeTheme('two','第二套',{paper:'var(--SmartThemeBlurTintColor, #f7f8fa)'});
  const store={schemaVersion:1,activePresetId:'two',items:[first,second]};
  const exported=createCustomThemesExport(store,{now:new Date('2026-11-13T03:04:05.000Z')});
  assert.deepEqual(Object.keys(exported),['format','schemaVersion','exportedAt','items']);
  assert.equal(exported.format,CUSTOM_THEME_EXPORT_FORMAT);
  assert.equal(exported.schemaVersion,1);
  assert.equal(exported.exportedAt,'2026-11-13T03:04:05.000Z');
  assert.deepEqual(exported.items,[first,second]);
  assert.match(stringifyCustomThemesExport(store),/"items": \[/u);
  assert.equal(createCustomThemesFilename(new Date(2026,10,13)),'qqj-themes-20261113.json');
});

test('合法导入会追加到现有主题库并保留当前激活主题',()=>{
  const current=makeTheme('existing','原主题');
  const incoming=[makeTheme('incoming','导入主题',{onPrimary:'#22282b'}),makeTheme('incoming-2','第二个导入主题')];
  const result=importCustomThemesJson(packageFor(incoming),{schemaVersion:1,activePresetId:'existing',items:[current]});
  assert.equal(result.importedCount,2);
  assert.equal(result.skippedCount,0);
  assert.equal(result.customThemeStore.items.length,3);
  assert.deepEqual(result.customThemeStore.items.slice(0,1),[current]);
  assert.equal(result.customThemeStore.activePresetId,'existing');
  assert.equal(result.customThemeStore.items[1].id,incoming[0].id);
  assert.equal(result.customThemeStore.items[1].variables.onPrimary,'auto');
  assert.equal(result.customThemeStore.items[2].id,incoming[1].id);
});

test('ID 与已有主题或同批导入主题冲突时生成唯一新 ID，不覆盖旧记录',()=>{
  const existing=makeTheme('same-id','原主题');
  const imported=[makeTheme('same-id','同 ID 导入'),makeTheme('same-id','同批重复 ID')];
  const result=importCustomThemesJson(packageFor(imported),{schemaVersion:1,activePresetId:'same-id',items:[existing]});
  assert.equal(result.importedCount,2);
  assert.deepEqual(result.customThemeStore.items.map(item=>item.id),['same-id','same-id-imported','same-id-imported-2']);
  assert.equal(result.customThemeStore.items[0].name,'原主题');
  assert.equal(result.customThemeStore.items[1].name,'同 ID 导入');
  assert.equal(result.customThemeStore.items[2].name,'同批重复 ID');
  assert.equal(result.customThemeStore.activePresetId,'same-id');
});

test('非法字段和不安全 CSS 项目会被逐项跳过，不影响其他合法主题',()=>{
  const valid=makeTheme('valid','合法主题');
  const unknownVariable=makeTheme('bad-variable','未知变量');
  unknownVariable.variables.extra='#000000';
  const unsafeCss=makeTheme('bad-css','危险 CSS');
  unsafeCss.variables.paper='url(https://example.invalid/theme.css)';
  const unsafeScript={...makeTheme('bad-script','脚本字段'),script:'alert(1)'};
  const result=importCustomThemesJson(packageFor([valid,unknownVariable,unsafeCss,unsafeScript]),emptyStore());
  assert.equal(result.importedCount,1);
  assert.equal(result.skippedCount,3);
  // 导入主题的 onPrimary 统一归一为 auto（阶段 1 兼容约定）。
  assert.deepEqual(result.customThemeStore.items,[{...valid,variables:{...valid.variables,onPrimary:'auto'}}]);
  assert.equal(JSON.stringify(result.customThemeStore).includes('example.invalid'),false);
  assert.equal(JSON.stringify(result.customThemeStore).includes('alert(1)'),false);
});

test('损坏 JSON 被拦截并给出可识别错误码',()=>{
  assert.throws(()=>importCustomThemesJson('{"format":',emptyStore()),error=>error.code==='INVALID_JSON');
});

test('错误 format、schemaVersion 或文件结构会拒绝整个文件',()=>{
  const valid=makeTheme('valid');
  const wrongFormat=JSON.parse(packageFor([valid]));wrongFormat.format='other';
  const wrongVersion=JSON.parse(packageFor([valid]));wrongVersion.schemaVersion=99;
  const missingItems=JSON.parse(packageFor([valid]));delete missingItems.items;
  for(const payload of [wrongFormat,wrongVersion,missingItems]){
    assert.throws(()=>importCustomThemesJson(JSON.stringify(payload),emptyStore()),error=>error.code==='INVALID_PACKAGE');
  }
});

test('外部 URL、JavaScript 和任意 CSS 不会进入已导入的主题库',()=>{
  const unsafeValues=[
    'url(https://evil.invalid/a.css)',
    'javascript:alert(1)',
    'body{background:red}',
    'var(--external-url, #ffffff)',
  ];
  const items=unsafeValues.map((value,index)=>{
    const theme=makeTheme('unsafe-'+index);
    theme.variables.paper=value;
    return theme;
  });
  const result=importCustomThemesJson(packageFor(items),emptyStore());
  assert.equal(result.importedCount,0);
  assert.equal(result.skippedCount,unsafeValues.length);
  assert.deepEqual(result.customThemeStore.items,[]);
});


test('浏览器导出使用 Blob 与 object URL 下载 JSON，并回收临时 URL',()=>{
  const preset=makeTheme('download','下载主题');
  const calls={appended:0,clicked:0,removed:0,created:[],revoked:[],scheduled:null};
  class FakeBlob {
    constructor(parts,options){this.parts=parts;this.type=options.type;}
  }
  const documentRef={
    body:{appendChild(link){calls.appended++;link.parentNode=this;}},
    createElement(tag){
      assert.equal(tag,'a');
      return {
        hidden:false,remove(){calls.removed++;},
        click(){calls.clicked++;},
      };
    },
  };
  const windowRef={
    Blob:FakeBlob,
    URL:{
      createObjectURL(blob){calls.created.push(blob);return 'blob:qqj-theme-test';},
      revokeObjectURL(url){calls.revoked.push(url);},
    },
    setTimeout(callback,delay){assert.equal(delay,0);calls.scheduled=callback;},
  };
  let downloadedLink;
  const originalCreate=documentRef.createElement;
  documentRef.createElement=tag=>{
    const link=originalCreate(tag);
    const setter=Object.defineProperty;
    setter(link,'href',{set(value){this._href=value;},get(){return this._href;}});
    setter(link,'download',{set(value){this._download=value;},get(){return this._download;}});
    const originalClick=link.click;
    link.click=()=>{downloadedLink=link;originalClick();};
    return link;
  };
  const result=downloadCustomThemesFile({
    customThemeStore:{schemaVersion:1,activePresetId:'download',items:[preset]},
    documentRef,windowRef,now:new Date('2026-11-13T03:04:05.000Z'),
  });
  assert.equal(result.filename,'qqj-themes-20261113.json');
  assert.equal(result.exportedCount,1);
  assert.equal(calls.appended,1);assert.equal(calls.clicked,1);assert.equal(calls.removed,1);
  assert.equal(downloadedLink.href,'blob:qqj-theme-test');
  assert.equal(downloadedLink.download,'qqj-themes-20261113.json');
  assert.equal(calls.created[0].type,'application/json;charset=utf-8');
  const payload=JSON.parse(calls.created[0].parts.join(''));
  assert.equal(payload.format,CUSTOM_THEME_EXPORT_FORMAT);
  assert.equal(payload.items[0].id,'download');
  assert.deepEqual(calls.revoked,[]);
  calls.scheduled();
  assert.deepEqual(calls.revoked,['blob:qqj-theme-test']);
});

test('超过大小上限的导入文本在解析前被拒绝',()=>{
  const huge=' '.repeat(MAX_THEME_IMPORT_BYTES+1);
  assert.throws(()=>importCustomThemesJson(huge,emptyStore()),error=>error.code==='IMPORT_TOO_LARGE');
});

test('导入不会让主题库超过上限，多余项目计入跳过且已有主题保持不变',()=>{
  const existing=Array.from({length:MAX_CUSTOM_THEMES-2},(_,index)=>makeTheme('old-'+index));
  const incoming=Array.from({length:5},(_,index)=>makeTheme('new-'+index));
  const result=importCustomThemesJson(packageFor(incoming),{schemaVersion:1,activePresetId:'old-0',items:existing});
  assert.equal(result.customThemeStore.items.length,MAX_CUSTOM_THEMES);
  assert.equal(result.importedCount,2);
  assert.equal(result.skippedCount,3);
  assert.equal(result.limitReached,true);
  assert.deepEqual(result.customThemeStore.items.slice(0,existing.length),existing);
  assert.equal(result.customThemeStore.activePresetId,'old-0');
});

test('主题库未满时 limitReached 为 false',()=>{
  const result=importCustomThemesJson(packageFor([makeTheme('a')]),emptyStore());
  assert.equal(result.limitReached,false);
});

test('主题库中存在字段缺失的主题时，导出只跳过该主题而不是整体失败',()=>{
  const good=makeTheme('good','完整主题');
  const partial={id:'partial',name:'缺字段',variables:{paper:'#ffffff'},createdAt:'',updatedAt:''};
  const store={schemaVersion:1,activePresetId:'good',items:[partial,good]};
  const exported=createCustomThemesExport(store,{now:new Date('2026-11-13T03:04:05.000Z')});
  assert.deepEqual(exported.items.map(item=>item.id),['good']);
  assert.doesNotThrow(()=>stringifyCustomThemesExport(store));
});

test('下载结果报告被跳过的不完整主题数量',()=>{
  const good=makeTheme('good','完整主题');
  const partial={id:'partial',name:'缺字段',variables:{paper:'#ffffff'}};
  const created=[];
  const documentRef={
    createElement:()=>{const link={click(){},remove(){}};created.push(link);return link;},
    body:{appendChild(){}},
  };
  const windowRef={Blob:class{constructor(parts){this.parts=parts;}},URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},setTimeout:callback=>callback()};
  const result=downloadCustomThemesFile({customThemeStore:{schemaVersion:1,activePresetId:null,items:[partial,good]},documentRef,windowRef,now:new Date('2026-11-13T03:04:05.000Z')});
  assert.equal(result.exportedCount,1);
  assert.equal(result.skippedCount,1);
});
