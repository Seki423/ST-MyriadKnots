import {
  CUSTOM_THEME_VARIABLES, THEME_FOLLOW_VARIABLES, THEME_STATIC_SEMANTIC_FIELDS, createDynamicCustomThemePreset,
  createStaticCustomThemePreset, hasHostFollowingVariables, isDirectHostVariable, normalizeCustomThemeStore, validateCustomThemePreset,
} from '../theme-presets.js';
import {
  MAX_THEME_IMPORT_BYTES, downloadCustomThemesFile, importCustomThemesJson,
} from '../theme-transfer.js';

// 映射表集中定义在 theme-presets.js；这里仅为兼容原有导入路径而再导出。
export { THEME_FOLLOW_VARIABLES, THEME_STATIC_SEMANTIC_FIELDS };
const LABELS = Object.freeze({
  paper:'页面底色',panel:'卡片底色',ink:'正文文字',soft:'次级文字',faint:'弱化文字',line:'边框线',
  thread:'连接线',crimson:'危险色',knot:'主题强调色',onPrimary:'强调色上的文字',blue:'信息色',success:'成功色',
});
const isDynamic=value=>hasHostFollowingVariables(value?.variables);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const cleanName=value=>String(value??'').normalize('NFKC').trim();
const pickerHex=value=>/^#[\da-f]{6}$/iu.test(value??'')?value:'#ffffff';

export function createThemePresetsSettings({settings,documentRef=globalThis.document,appearance,overlayRoot,confirmImpl=async()=>false,notifyImpl}={}) {
  if(!settings?.get||!settings?.update||!documentRef?.createElement||!appearance)throw new TypeError('自定义主题设置参数无效。');
  const win=documentRef.defaultView??globalThis;
  const raf=win.requestAnimationFrame?.bind(win)??(callback=>{callback();return 0;});
  const caf=win.cancelAnimationFrame?.bind(win)??(()=>{});
  const el=(tag,cls='',content='')=>{const n=documentRef.createElement(tag);if(cls)n.className=cls;if(content!=='')n.textContent=content;return n;};
  const btn=(label,cls,action)=>{const n=el('button',cls,label);n.type='button';n.addEventListener('click',action);return n;};
  const node=el('section','qqj-theme-manager'),head=el('div','qqj-theme-header');
  head.append(el('h3','','自定义主题'),el('p','qqj-theme-hint','管理自己的配色方案；应用主题不会改动酒馆的日间 / 夜间 / 跟随模式。'));
  const list=el('div','qqj-theme-list'),actions=el('div','qqj-theme-actions'),transfer=el('div','qqj-theme-transfer');
  actions.append(btn('从当前主题复制','secondary-action',()=>openNew(false)),btn('从宿主主题复制','secondary-action',()=>openNew(true)));
  const exportButton=btn('导出全部主题','secondary-action',()=>{void exportThemes();});
  const importButton=btn('导入主题','secondary-action',()=>{fileInput.value='';fileInput.click();});
  const fileInput=el('input','qqj-theme-file-input');fileInput.type='file';fileInput.accept='.json';fileInput.hidden=true;
  fileInput.setAttribute('aria-label','选择自定义主题 JSON 文件');
  const transferHint=el('span','qqj-theme-hint','可将全部自定义主题导出为 JSON；导入后需手动应用主题。');
  transfer.append(exportButton,importButton,fileInput,transferHint);
  const transferFeedback=el('p','qqj-theme-feedback');transferFeedback.setAttribute('role','status');
  node.append(head,list,actions,transfer,transferFeedback);
  let modal=null,draft=null,editingId=null,previousFocus=null,pendingFrame=null,feedback=null,disposed=false;
  let pickerInputs=new Map(),editedPickers=new Set();
  const store=()=>normalizeCustomThemeStore(settings.get().customThemeStore);
  const palette=()=>appearance.getComputedPalette?.()??appearance.getState?.()?.palette??{};
  const restoreAppearance=()=>typeof appearance.restore==='function'?appearance.restore():appearance.apply?.();
  const notify=async({title,body})=>{
    if(typeof notifyImpl==='function'){
      try{await notifyImpl({title,body,confirmText:'知道了'});return;}
      catch{/* fall through to the inline status message */}
    }
    transferFeedback.textContent=title+'：'+body;
  };
  const exportThemes=async()=>{
    try{
      const result=downloadCustomThemesFile({
        customThemeStore:settings.get().customThemeStore,documentRef,windowRef:win,now:new Date(),
      });
      await notify({title:'导出完成',body:'已导出 '+result.exportedCount+' 个自定义主题。'+(result.skippedCount>0?'另有 '+result.skippedCount+' 个不完整的主题未导出。':'')});
    }catch(error){
      await notify({title:'导出失败',body:error?.message==='当前浏览器不支持文件下载。'?error.message:'无法生成主题文件，请稍后重试。'});
    }
  };
  const importThemesFromFile=async()=>{
    const file=fileInput.files?.[0];if(!file)return;
    importButton.disabled=true;
    try{
      if(typeof file.text!=='function')throw new Error('当前浏览器无法读取所选文件。');
      // 读入内存前先按文件大小拦截，避免异常大文件占满内存。
      if(Number.isFinite(file.size)&&file.size>MAX_THEME_IMPORT_BYTES)throw Object.assign(new Error('文件过大'),{code:'IMPORT_TOO_LARGE'});
      const result=importCustomThemesJson(await file.text(),settings.get().customThemeStore);
      if(result.importedCount>0)settings.update({customThemeStore:result.customThemeStore});
      render();
      await notify({title:'导入完成',body:'成功导入 '+result.importedCount+' 个主题，跳过 '+result.skippedCount+' 个不合法的主题。'+(result.limitReached?'主题数量已达上限，多余的主题未导入。':'')});
    }catch(error){
      const body=error?.code==='INVALID_JSON'
        ?'文件不是有效的 JSON。请检查文件内容后重试。'
        :error?.code==='INVALID_PACKAGE'
          ?'主题文件格式或版本不受支持，无法导入。'
          :error?.code==='IMPORT_TOO_LARGE'
            ?'主题文件过大（上限 1 MB），无法导入。'
            :'读取主题文件失败，请确认文件可正常打开后重试。';
      await notify({title:'导入失败',body});
    }finally{
      fileInput.value='';importButton.disabled=false;
    }
  };
  fileInput.addEventListener('change',()=>{void importThemesFromFile();});
  const render=()=>{
    if(disposed)return;list.replaceChildren();const saved=store();
    if(!saved.items.length){list.append(el('p','qqj-theme-empty','还没有自定义主题。可以从当前主题复制一份，再开始调整。'));return;}
    for(const preset of saved.items){
      const card=el('article','qqj-theme-card'),title=el('div','qqj-theme-card-header');
      title.append(el('strong','qqj-theme-name',preset.name));
      if(saved.activePresetId===preset.id)title.append(el('span','qqj-theme-status','已激活'));
      const swatches=el('div','qqj-theme-swatches');
      for(const key of CUSTOM_THEME_VARIABLES){
        const chip=el('span','qqj-theme-swatch');chip.title=LABELS[key];
        chip.setAttribute('aria-label',LABELS[key]+'：'+(preset.variables[key]??'使用基础主题回退'));
        chip.style.setProperty('background-color',key==='onPrimary'?(preset.variables.knot??'var(--knot)'):(preset.variables[key]??'var(--'+key+')'));
        if(key==='onPrimary'){chip.textContent='Aa';chip.style.setProperty('color',preset.variables.onPrimary==='auto'?'var(--on-primary)':preset.variables.onPrimary);}
        swatches.append(chip);
      }
      const meta=el('div','qqj-theme-card-meta',isDynamic(preset)?'动态跟随':'静态配色'),controls=el('div','qqj-theme-card-actions');
      controls.append(btn('应用','primary-action',()=>applyPreset(preset.id)),btn('编辑','secondary-action',()=>openEditor(preset)),btn('删除','danger-action',()=>{void removePreset(preset.id);}));
      card.append(title,swatches,meta,controls);list.append(card);
    }
  };
  const applyPreset=id=>{
    const saved=store();if(!saved.items.some(item=>item.id===id))return;
    settings.update({customThemeStore:{...saved,activePresetId:id}});restoreAppearance();render();
  };
  const removePreset=async id=>{
    const saved=store(),target=saved.items.find(item=>item.id===id);if(!target)return;
    const okay=await confirmImpl({title:'删除自定义主题',body:'确定删除「'+target.name+'」吗？此操作无法撤销。',confirmText:'删除',cancelText:'取消',danger:true});
    if(!okay)return;
    // 确认框是异步的：弹窗期间主题库可能已变化（如导入完成），必须基于最新库删除，不能覆盖旧快照。
    const latest=store();if(!latest.items.some(item=>item.id===id))return;
    settings.update({customThemeStore:{...latest,activePresetId:latest.activePresetId===id?null:latest.activePresetId,items:latest.items.filter(item=>item.id!==id)}});
    restoreAppearance();render();
  };
  const schedulePreview=()=>{
    if(!modal||!draft)return;if(pendingFrame!==null)caf(pendingFrame);
    pendingFrame=raf(()=>{
      pendingFrame=null;if(!modal||!draft)return;
      try{
        appearance.preview?.({...draft,variables:{...draft.variables}});
        const computed=appearance.getComputedPalette?.()??{};
        for(const [key,input] of pickerInputs){
          if(!editedPickers.has(key)&&computed[key])input.value=pickerHex(computed[key]);
        }
      }catch(error){if(feedback)feedback.textContent='预览失败：'+(error?.message??'颜色值无法应用。');}
    });
  };
  const closeEditor=({restore=true}={})=>{
    if(pendingFrame!==null){caf(pendingFrame);pendingFrame=null;}if(!modal)return;
    overlayRoot?.removeEventListener?.('keydown',onEditorKeydown,true);modal.remove?.();modal=null;draft=null;editingId=null;feedback=null;pickerInputs.clear();editedPickers.clear();
    if(restore)restoreAppearance();previousFocus?.focus?.();previousFocus=null;
  };
  function onEditorKeydown(event){
    if(!modal||event.key!=='Escape'||event.isComposing)return;
    event.preventDefault?.();event.stopPropagation?.();event.stopImmediatePropagation?.();closeEditor({restore:true});render();
  }
  const saveDraft=applyAfterSave=>{
    const name=cleanName(draft?.name);if(!name||name.length>80){feedback.textContent='请填写 1–80 个字符的主题名称。';return;}
    const saved=store(),collision=saved.items.find(item=>item.id!==editingId&&cleanName(item.name).toLocaleLowerCase()===name.toLocaleLowerCase());
    if(collision){feedback.textContent='已有同名主题，请换一个名称。';return;}
    const now=new Date().toISOString();let candidate;
    try{candidate=validateCustomThemePreset({...draft,name,updatedAt:now,createdAt:draft.createdAt||now,variables:{...draft.variables}});}
    catch(error){feedback.textContent='无法保存：'+(error?.message??'主题内容无效。');return;}
    const items=saved.items.filter(item=>item.id!==candidate.id);items.push(candidate);
    settings.update({customThemeStore:{schemaVersion:1,activePresetId:applyAfterSave?candidate.id:(saved.activePresetId===candidate.id?candidate.id:saved.activePresetId),items}});
    closeEditor({restore:false});restoreAppearance();render();
  };
  const openEditor=(preset,isNew=false)=>{
    if(disposed||!overlayRoot)return;closeEditor({restore:true});previousFocus=documentRef.activeElement??null;
    const current=palette(),original=preset??createStaticCustomThemePreset({name:'未命名主题',palette:current});
    draft={...original,name:original.name??'未命名主题',variables:{...current,...original.variables}};editingId=isNew?null:original.id;
    modal=el('div','qqj-theme-modal');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',isNew?'新建自定义主题':'编辑自定义主题');
    const editor=el('section','qqj-theme-editor'),header=el('header','qqj-theme-editor-header');
    header.append(el('h3','',isNew?'新建主题':'编辑主题'),btn('×','qqj-theme-close',()=>{closeEditor();render();}));
    const body=el('div','qqj-theme-editor-body'),nameLabel=el('label','qqj-theme-name-field');nameLabel.append(el('span','','主题名称'));
    const nameInput=el('input','qqj-theme-name-input');nameInput.type='text';nameInput.maxLength=80;nameInput.value=draft.name;nameInput.addEventListener('input',()=>{draft.name=nameInput.value;});nameLabel.append(nameInput);
    const rows=el('div','qqj-theme-colors');
    for(const key of CUSTOM_THEME_VARIABLES){
      const row=el('div','qqj-theme-color-row'),label=el('label','qqj-theme-color-label',LABELS[key]),input=el('input','qqj-theme-color-input');
      input.type='color';input.value=pickerHex(draft.variables[key]);input.setAttribute('aria-label',LABELS[key]+'颜色');
      pickerInputs.set(key,input);
      const mode=el('span','qqj-theme-color-mode',isDynamic({variables:{[key]:draft.variables[key]}})?'跟随中':'静态');let follow=null;
      input.addEventListener('input',()=>{editedPickers.add(key);draft.variables[key]=input.value.toLowerCase();mode.textContent='静态';if(follow)follow.textContent='跟随宿主';schedulePreview();});
      row.append(label,input);
      if(own(THEME_FOLLOW_VARIABLES,key)){
        follow=btn(isDirectHostVariable(draft.variables[key])?'改为静态':'跟随宿主','qqj-theme-follow',()=>{
          if(isDirectHostVariable(draft.variables[key])){draft.variables[key]=input.value.toLowerCase();mode.textContent='静态';follow.textContent='跟随宿主';}
          else{draft.variables[key]='var('+THEME_FOLLOW_VARIABLES[key]+', '+input.value.toLowerCase()+')';mode.textContent='跟随中';follow.textContent='改为静态';}
          schedulePreview();
        });row.append(follow);
      }else if(key==='onPrimary'){
        const automatic=btn(draft.variables.onPrimary==='auto'?'改为静态':'自动文字色','qqj-theme-follow',()=>{
          draft.variables.onPrimary=draft.variables.onPrimary==='auto'?input.value.toLowerCase():'auto';
          mode.textContent=draft.variables.onPrimary==='auto'?'自动':'静态';automatic.textContent=draft.variables.onPrimary==='auto'?'改为静态':'自动文字色';input.disabled=draft.variables.onPrimary==='auto';schedulePreview();
        });row.append(automatic);input.disabled=draft.variables.onPrimary==='auto';
      }
      if(THEME_STATIC_SEMANTIC_FIELDS.includes(key)){mode.textContent='静态 HEX';input.value=pickerHex(draft.variables[key]);}
      row.append(mode);rows.append(row);
    }
    const preview=el('section','qqj-theme-preview');
    preview.append(el('span','qqj-theme-preview-eyebrow','实时预览'),el('strong','qqj-theme-preview-title','千千结 · 自定义主题'));
    preview.append(el('p','qqj-theme-preview-content','这是一段正文预览，用于查看页面底色、文字、卡片与边框在当前配色中的表现。'));
    preview.append(el('p','qqj-theme-preview-meta','次级文字与弱化文字预览 · 连接线 ─────'));
    const samples=el('div','qqj-theme-preview-actions');
    samples.append(el('span','qqj-theme-preview-primary','强调操作'),el('span','qqj-theme-preview-danger','危险提示'),el('span','qqj-theme-preview-success','成功提示'),el('span','qqj-theme-preview-info','信息提示'));preview.append(samples);
    feedback=el('p','qqj-theme-feedback');feedback.setAttribute('role','status');
    body.append(nameLabel,rows,preview,feedback);
    const footer=el('footer','qqj-theme-editor-footer');
    footer.append(btn('取消','secondary-action',()=>{closeEditor();render();}),btn('保存','secondary-action',()=>saveDraft(false)),btn('保存并应用','primary-action',()=>saveDraft(true)));
    editor.append(header,body,footer);modal.append(editor);overlayRoot.append(modal);overlayRoot.addEventListener?.('keydown',onEditorKeydown,true);nameInput.focus?.();schedulePreview();
  };
  const openNew=dynamic=>{
    let current;try{current=palette();}catch{current=appearance.getState?.()?.palette??{};}
    try{const preset=dynamic?createDynamicCustomThemePreset({name:'宿主跟随主题',palette:current}):createStaticCustomThemePreset({name:'我的主题',palette:current});openEditor(preset,true);}
    catch(error){list.append(el('p','qqj-theme-feedback','无法读取当前配色：'+(error?.message??'请稍后重试。')));}
  };
  const dispose=()=>{if(disposed)return;closeEditor({restore:true});disposed=true;node.remove?.();};
  render();return Object.freeze({node,dispose,refresh:render});
}
