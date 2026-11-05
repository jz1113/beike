import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderInput, Settings2, Sparkles, Upload } from 'lucide-react';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import type { SalesStudioAssetCatalog } from '@client/features/sales/api/salesProduction';
import '@client/features/sales/salesStudio.css';
import '@client/features/sales/salesLibrary.css';
import '@client/features/sales/salesProduct.css';
import { SalesPersonaDialog } from '@client/features/sales/components/SalesPersonaDialog';
import { SalesSceneDialog } from '@client/features/sales/components/SalesSceneDialog';
import { SalesImageImportDialog } from '@client/features/sales/components/SalesImageImportDialog';
import { SalesScriptBatchImportDialog } from '@client/features/sales/components/SalesScriptBatchImportDialog';
import { useSalesScriptImport } from '@client/features/sales/hooks/useSalesScriptImport';
import { useSalesSummaryModels } from '@client/features/sales/hooks/useSalesSummaryModels';
import { PERSONA_CATEGORIES, type PersonaCategory } from '@client/features/sales/model/salesPersonaClassification';
import { LibrarySkillSettings } from './LibrarySkillSettings';
import { personaFolder } from './mediaCategories';

type Dialog = 'analysis' | 'generate' | 'images' | 'skills';

export function LibraryProductionTools({folder, catalog, onNotice}: {
  folder:string; catalog:SalesStudioAssetCatalog | null; onNotice:(message:string)=>void;
}) {
  const [dialog,setDialog] = useState<Dialog|null>(null);
  const [files,setFiles] = useState<File[]>([]);
  const [preferredModel,setPreferredModel] = useState('');
  const directory = useRef<HTMLInputElement>(null);
  const batch = useSalesScriptImport(invalidateGlobalAssetCache);
  const {model} = useSalesSummaryModels(preferredModel);
  const [root,gender] = folder.split('/');
  const action = root === '动作';
  const persona = root === '人物';
  if (!action && !persona && root !== '场景') return null;

  const group = (Object.keys(PERSONA_CATEGORIES) as PersonaCategory[]).find(value => personaFolder(value) === folder)
    ?? (gender === '男' ? 'male' : 'female');
  const draftId = folder === root ? undefined : 'new:'+folder;
  const space = folder === '场景/室外' ? 'outdoor' : 'indoor';
  const close = () => { setDialog(null); setFiles([]); };

  return <>
    {action ? <button className="bml-import" onClick={()=>setDialog('analysis')}><Upload size={14}/>
      {batch.pending ? '查看视频分析进度' : '导入视频分析'}</button> : <>
      <button className="bml-import" onClick={()=>setDialog('generate')}><Sparkles size={14}/>{root}生成</button>
      <button onClick={()=>setDialog('images')}><Upload size={14}/>导入图片</button>
    </>}
    <button disabled={action && batch.pending} onClick={()=>directory.current?.click()}><FolderInput size={14}/>导入文件夹</button>
    <button onClick={()=>setDialog('skills')}><Settings2 size={14}/>文案设置</button>
    <input hidden type="file" multiple ref={el=>{directory.current=el;el?.setAttribute('webkitdirectory','');}}
      onChange={event=>{
        const chosen = Array.from(event.target.files ?? []).filter(file=>!file.name.startsWith('.'));
        event.target.value='';
        if (!chosen.length) return;
        if (action) { batch.addFiles(chosen); setDialog('analysis'); }
        else { setFiles(chosen); setDialog('images'); }
      }}/>
    {dialog && createPortal(<div className="sales-studio">
      {dialog === 'skills' && <LibrarySkillSettings kind={action ? 'script' : persona ? 'persona' : 'scene'} onClose={close}/>}
      {dialog === 'analysis' && <SalesScriptBatchImportDialog preferredModel={preferredModel} onModelChange={setPreferredModel}
        items={batch.items} pending={batch.pending} error={batch.error} errors={batch.errors}
        includeDepth={batch.includeDepth} onIncludeDepthChange={batch.setIncludeDepth}
        onAddFiles={batch.addFiles} onRemove={batch.remove} onClearCompleted={batch.clearCompleted}
        onStart={()=>void batch.start(model)} onStop={batch.stop} onClose={close}/>}
      {dialog === 'generate' && (persona
        ? <SalesPersonaDialog draftId={draftId} defaultGroup={group} voices={catalog?.voices ?? []} onClose={close} onSaved={onNotice}/>
        : <SalesSceneDialog draftId={draftId} defaultSpace={space} onClose={close} onSaved={onNotice}/>)}
      {dialog === 'images' && <SalesImageImportDialog kind={persona ? 'persona' : 'scene'}
        existingNames={persona ? catalog?.personas.map(item=>item.name) ?? [] : catalog?.scenes.map(item=>item.title) ?? []}
        initialFiles={files} personaGroup={group} sceneSpace={space} onClose={close} onImported={count=>{
          invalidateGlobalAssetCache();
          onNotice(`已导入 ${count} 个${root}资产`);
        }}/>}
    </div>,document.body)}
  </>;
}
