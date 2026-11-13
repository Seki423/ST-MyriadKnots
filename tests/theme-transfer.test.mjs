import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_THEME_EXPORT_FORMAT,
  createCustomThemesExport,
  createCustomThemesFilename,
  importCustomThemesJson,
  stringifyCustomThemesExport,
} from '../src/ui/theme-transfer.js';
import { validateCustomThemePreset } from '../src/ui/theme-presets.js';

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
  const incoming=[makeTheme('incoming','导入主题'),makeTheme('incoming-2','第二个导入主题')];
  const result=importCustomThemesJson(packageFor(incoming),{schemaVersion:1,activePresetId:'existing',items:[current]});
  assert.equal(result.importedCount,2);
  assert.equal(result.skippedCount,0);
  assert.equal(result.customThemeStore.items.length,3);
  assert.deepEqual(result.customThemeStore.items.slice(0,1),[current]);
  assert.equal(result.customThemeStore.activePresetId,'existing');
  assert.deepEqual(result.customThemeStore.items.slice(1),incoming);
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
  assert.deepEqual(result.customThemeStore.items,[valid]);
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
