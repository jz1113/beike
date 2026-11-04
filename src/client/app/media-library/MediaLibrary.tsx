import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Folder, Grid2X2, List, FolderInput, Upload, RefreshCw, Search, X } from 'lucide-react';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { useAppStore } from '@client/store';
import { getGlobalAssetLibrary, subscribeAssetInvalidation, type GlobalAssetStore } from '@client/shared/api/assetLibraryCache';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { collectCustomMedia, readMediaFolders, loadCustomAssets, mediaFolderKinds } from '@client/features/assets/model/customAssetStore';
import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import { fetchSalesStudioAssets, type SalesStudioAssetCatalog } from '@client/features/sales/api/salesProduction';
import { listSalesScripts, type StoredSalesScript } from '@client/features/sales/api/salesScripts';
import type { SalesLibraryChoice } from '@client/features/sales/model/salesWorkspace';
import { indexLibrary, mediaKind, type LibraryMedia, type LibraryEntry } from './mediaIndex';
import { mediaLabels as labels } from './LibraryMediaCard';
import { MediaLibraryResults } from './MediaLibraryResults';
import { MediaFolderSidebar } from './MediaFolderSidebar';
import { MediaCollectionControls } from './MediaCollectionControls';
import { SalesAssetJobsPanel } from '@client/features/sales/components/SalesAssetJobsPanel';
import { LibraryProductionTools } from './LibraryProductionTools';
import { ScriptDetail } from './ScriptDetail';
import { indexMediaFolders } from './mediaFolders';
import './mediaLibrary.css';


export default function MediaLibrary({onInsert,onUseReference,onClose,onDragChange,onRoleResources, initialFolder = '', visit, onReturn, onSelectSales, productionTools}: {
  onUseReference?:(item:LibraryMedia)=>void;
  initialFolder?:string; visit?:object | null; onReturn?:()=>void; productionTools?:boolean;
  onSelectSales?:(choice:SalesLibraryChoice)=>void;
  onInsert?:(item:LibraryMedia)=>void; onClose?:()=>void; onDragChange?:(dragging:boolean)=>void; onRoleResources?:()=>void;
}) {
  const active = useViewVisibility();
  const resumed = useRef(false);
  const tasks = useAppStore(s=>s.generationTasks);
  const sessions = useAppStore(s=>s.sessions);
  const projects = useCanvasStore(s=>s.projects);
  const [local,setLocal] = useState(loadCustomAssets);
  const [savedFolders,setSavedFolders]=useState<string[]>([]);
  const previousSaved = useRef<string[]>([]);
  const [catalog,setCatalog] = useState<SalesStudioAssetCatalog|null>(null);
  const [shared,setShared] = useState<GlobalAssetStore|null>(null);
  const [version,setVersion] = useState(0);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState('');
  const [query,setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const [folder,setFolder] = useState(initialFolder);
  const [foldersOpen,setFoldersOpen] = useState(false);
  const folderPanelId = useId();
  const [scripts,setScripts] = useState<StoredSalesScript[]>([]);
  const [kind,setKind] = useState<LibraryEntry['kind']|'all'>('all');
  const [layout,setLayout] = useState<'grid'|'list'>('grid');
  const [size,setSize] = useState(148);
  const [preview,setPreview] = useState<LibraryEntry|null>(null);
  const [previewError,setPreviewError] = useState('');
  const previewRef = useModalDialog(active && Boolean(preview && preview.kind !== 'script'), () => setPreview(null));
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [failedImports,setFailedImports] = useState<File[]>([]);
  const importLock = useRef(false);
  const uploadedImports = useRef(new Map<File,string>());
  const files = useRef<HTMLInputElement>(null);
  const directory = useRef<HTMLInputElement>(null);
  useEffect(()=>{
    setFolder(initialFolder); setKind('all'); setQuery(''); setPreview(null);
  },[initialFolder,visit]);
  useEffect(()=>{
    const update = () => {
      setLocal(loadCustomAssets());
      try {
        const saved = readMediaFolders();
        setSavedFolders(saved);
        const previous = previousSaved.current;
        previousSaved.current = saved;
        setFolder(current => previous.includes(current) && !saved.includes(current) ? '' : current);
      } catch {setNotice('无法读取本机素材文件夹');}
    };
    update();
    const storage = (e:StorageEvent) => {if (!e.key || e.key === 'beike.custom_assets' || e.key === 'beike.media_folders.v1') update();};
    window.addEventListener('beike:custom_assets_updated',update);
    window.addEventListener('storage',storage);
    return ()=>{window.removeEventListener('beike:custom_assets_updated',update);window.removeEventListener('storage',storage);};
  },[]);
  useEffect(()=>{
    if (!active) { resumed.current = true; return; }
    const abort = new AbortController();
    setLoading(true);setLoadError('');
    Promise.allSettled([fetchSalesStudioAssets(abort.signal),getGlobalAssetLibrary(version > 0 || resumed.current),listSalesScripts(abort.signal)]).then(([sales,assets,references])=>{
      if(abort.signal.aborted)return;
      if(sales.status === 'fulfilled')setCatalog(sales.value);
      if(assets.status === 'fulfilled')setShared({...assets.value});
      if(references.status === 'fulfilled')setScripts(references.value);
      const missing=[references.status === 'rejected'?'动作脚本':'',sales.status === 'rejected'?'工作区资产':'',assets.status === 'rejected' || !assets.value.isLoaded?'资产库':''].filter(Boolean);
      setLoadError(missing.length ? missing.join('、')+'未能读取，点刷新可重试。' : '');
      setLoading(false);
    });
    resumed.current = false;
    return ()=>abort.abort();
  },[active,version]);
  useEffect(()=>subscribeAssetInvalidation(()=>setVersion(n=>n+1)),[]);
  const items = useMemo(()=>indexLibrary(local,[...tasks,...sessions.flatMap(s=>s.tasks)],projects,catalog,shared,scripts),[local,tasks,sessions,projects,catalog,shared,scripts]);
  const folders = useMemo(()=>indexMediaFolders(items,savedFolders),[items,savedFolders]);
  const root = folder.split('/')[0];
  const productionFolder = productionTools && ['动作','人物','场景'].includes(root);
  const fixedKind = mediaFolderKinds[root];
  const selectedKind = fixedKind || kind;
  const term = query.trim().toLocaleLowerCase();
  const visible = useMemo(()=>items.filter(item=>(selectedKind==='all'||selectedKind===item.kind)
    && (!folder || item.folders.some(path=>path===folder || path.startsWith(folder+'/')))
    && (!term || [item.name,...item.keywords,...item.folders].join(' ').toLocaleLowerCase().includes(term))
  ),[items,selectedKind,folder,term]);
  useEffect(()=>{
    if (!active || preview || !onClose) return;
    const keyDown = (e:KeyboardEvent) => {
      if(e.key==='Escape' && !e.defaultPrevented && !document.querySelector('dialog[open]')){e.preventDefault();e.stopPropagation();onClose();}
    };
    window.addEventListener('keydown',keyDown); return ()=>window.removeEventListener('keydown',keyDown);
  },[active,preview,onClose]);
  async function importFiles(list:File[]) {
    if (importLock.current || !list.length) return;
    importLock.current = true;
    setBusy(true);let added=0,skipped=0;
    const failed:File[] = [], errors:string[] = [];
    const paths = new Set(list.map(file=>file.webkitRelativePath || file.name));
    failedImports.forEach(file=>{
      if (!list.includes(file) && paths.has(file.webkitRelativePath || file.name)) uploadedImports.current.delete(file);
    });
    for (const file of list) {
      const type=mediaKind(file.type) || mediaKind(file.name);
      if(!type){skipped++;continue;}
      try {
        const url=uploadedImports.current.get(file) || await uploadStudioFile(file,'canvas-library');
        uploadedImports.current.set(file,url);
        const path=file.webkitRelativePath.split('/').slice(0,-1).join('/');
        collectCustomMedia(file.name,url,type,path ? '导入素材/'+path : '导入素材',false);
        uploadedImports.current.delete(file);
        added++;
      } catch (error) {
        failed.push(file);
        errors.push(file.name+'：'+(error instanceof Error ? error.message : '上传或保存失败'));
      }
    }
    setFailedImports(previous=>[...previous.filter(file=>!paths.has(file.webkitRelativePath || file.name)),...failed]);
    setNotice(`已导入 ${added} 项`+(failed.length?`，${failed.length} 项上传或保存失败。${errors.slice(0,3).join('；')}`:'')+(skipped?`，跳过 ${skipped} 个非媒体文件`:''));
    if(added){setFolder('导入素材');setKind('all');setQuery('');}
    importLock.current = false;
    setBusy(false);
  }
  const openPreview = useCallback((item:LibraryEntry) => {
    setPreviewError('');
    setPreview(item);
  },[]);
  const previewScript = preview?.kind === 'script' ? scripts.find(record => record.id === preview.record.id) : undefined;
  const close = preview ? ()=>setPreview(null) : onClose;
  const collectionControls = preview && <MediaCollectionControls item={preview} folder={folder} saved={savedFolders}
    onDone={(message,path)=>{setPreview(null);setFolder(path);setKind('all');setQuery('');setNotice(message);}}/>;
  return <section className="beike-media-library" aria-label="统一素材库">
    <header><h2>素材库</h2>
      <div className="bml-tools">
        {onReturn && <button onClick={onReturn}>返回视频制作</button>}
        {productionTools && <LibraryProductionTools folder={folder} catalog={catalog} onNotice={setNotice}/>}
        {!productionFolder && root !== '动作' && <><button className="bml-import" disabled={busy} onClick={()=>files.current?.click()}><Upload size={14}/>{busy?'导入中…':'导入文件'}</button>
        <button disabled={busy} onClick={()=>directory.current?.click()}><FolderInput size={14}/>导入文件夹</button></>}
        <button disabled={loading} aria-label="刷新素材库" title={loading ? '正在读取素材' : '刷新素材库'} onClick={()=>{setLocal(loadCustomAssets());setVersion(n=>n+1);}}><RefreshCw size={16}/></button>
        {onClose && <button aria-label="关闭素材库" onClick={onClose}><X size={17}/></button>}
      </div>
      <input hidden ref={files} type="file" accept="image/*,video/*,audio/*" multiple onChange={e=>{void importFiles(Array.from(e.target.files ?? []));e.target.value='';}}/>
      <input hidden ref={el=>{directory.current=el;el?.setAttribute('webkitdirectory','');}} type="file" multiple onChange={e=>{void importFiles(Array.from(e.target.files ?? []));e.target.value='';}}/>
    </header>
    <button type="button" className="bml-folder-toggle" aria-expanded={foldersOpen} aria-controls={folderPanelId}
      onClick={()=>setFoldersOpen(open=>!open)}><Folder size={15}/><span>{folder || '全部文件夹'}</span><ChevronDown size={14}/></button>
    <MediaFolderSidebar id={folderPanelId} expanded={foldersOpen} folder={folder} folders={folders} saved={savedFolders}
      count={items.length} onSelect={path=>{setFolder(path);setKind('all');setQuery('');}} onNotice={setNotice} onRoleResources={onRoleResources}/>
    <main>
      <div className="bml-tools"><div className="bml-search"><Search size={15}/>
        <input ref={searchInput} autoFocus={!!onClose} aria-label="搜索素材" placeholder="搜索名称、标签或文件夹"
          value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{
            if (e.key==='Escape' && query && !e.nativeEvent.isComposing) {
              e.preventDefault(); e.stopPropagation(); setQuery('');
            }
          }}/>
        {query && <button type="button" aria-label="清除搜索" onClick={()=>{setQuery('');searchInput.current?.focus();}}>
          <X size={14}/>
        </button>}
      </div>
        <button aria-label="网格视图" aria-pressed={layout==='grid'} onClick={()=>setLayout('grid')}><Grid2X2 size={15}/></button>
        <button aria-label="列表视图" aria-pressed={layout==='list'} onClick={()=>setLayout('list')}><List size={15}/></button>
        {layout==='grid' && <input aria-label="缩略图尺寸" type="range" min="100" max="240" step="8" value={size} onChange={e=>setSize(Number(e.target.value))}/>}
      </div>
      <div className="bml-tools">{(fixedKind ? [fixedKind] : Object.keys(labels) as Array<keyof typeof labels>).map(key=><button key={key} aria-pressed={selectedKind===key} onClick={()=>setKind(key)}>{labels[key]}</button>)}</div>
      {productionTools && active && (root === '人物' || root === '场景') &&
        <SalesAssetJobsPanel kind={root === '人物' ? 'persona' : 'scene'}/>}
      <p className="bml-count">{folder || '全部文件夹'} · {visible.length} 项</p>
      {(notice || loadError) && <p className="bml-notice" role="status">{[notice,loadError].filter(Boolean).join('　')}</p>}
      {!!failedImports.length && <button disabled={busy} onClick={()=>void importFiles(failedImports)}>
        {busy?'正在重试…':`重试失败的 ${failedImports.length} 项`}
      </button>}
      {!visible.length ? <div className="bml-empty">{loading?'正在读取素材…':savedFolders.includes(folder) && !query && kind === 'all'?'这个文件夹还是空的。预览素材后，点「加入文件夹」即可收藏。':items.length?'没有匹配的素材，可调整文件夹或筛选条件。':'还没有素材，导入文件或文件夹开始整理。'}</div>
        : <MediaLibraryResults key={JSON.stringify([folder,selectedKind,term])} items={visible} folder={folder} folders={folders.map(node=>node.path)}
          layout={layout} size={size} onNotice={setNotice} onMoved={path=>{setFolder(path);setKind('all');setQuery('');}}
          onPreview={openPreview} onSelectSales={visit ? onSelectSales : undefined} onInsert={onInsert} onDragChange={onDragChange}/>}

    </main>
    {preview?.kind === 'script' && <ScriptDetail folder={folder} key={preview.record.id} item={previewScript ? {...preview, record:previewScript} : preview} onNotice={setNotice} onClose={()=>setPreview(null)} onSelectSales={onSelectSales} collectionControls={collectionControls}/>}
    {preview && preview.kind !== 'script' && <div ref={previewRef} tabIndex={-1} className="bml-viewer" role="dialog" aria-modal="true" aria-label="素材预览">
      <div><strong>{preview.name}</strong><button onClick={close} aria-label="关闭预览"><X size={18}/></button></div>
      {preview.kind==='image'?<img src={proxyMediaUrl(preview.url)} alt={preview.name}/>:preview.kind==='video'?<video controls src={proxyMediaUrl(preview.url,{asVideo:true})}/>:<audio controls src={proxyMediaUrl(preview.url,{asAudio:true})}/>}
      {onUseReference && preview.kind !== 'audio' && <button className="bml-use-reference" onClick={()=>{
        try { onUseReference(preview); setPreview(null); }
        catch (error) { setPreviewError(error instanceof Error ? error.message : '添加参考素材失败'); }
      }}>用作生成参考</button>}
      {previewError && <p role="alert">{previewError}</p>}
      {collectionControls}
      {onSelectSales && preview.salesChoices?.map(choice=><button key={choice.type+choice.id}
        onClick={()=>{setPreview(null); onSelectSales(choice);}}>用于视频制作 · {choice.title}</button>)}
      {onInsert && <button onClick={()=>onInsert(preview)}>放入画布</button>}
    </div>}
  </section>;
}
