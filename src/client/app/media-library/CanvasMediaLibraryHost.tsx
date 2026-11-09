import { canvasLibraryMedia } from '@client/shared/workspace/canvasWorkspace';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import { canvasWorkflowUploadError, canvasWorkflowUploadSlot } from '@client/features/canvas/model/videoWorkflowRecovery';
import { lazyWithRetry } from '../routes';

import type { LibraryMedia, PendingMediaInsert } from './mediaIndex';

const loadMediaLibrary = () => import('./MediaLibrary');
const LazyMediaLibrary = lazyWithRetry(loadMediaLibrary);
let preloadedMediaLibrary: Awaited<ReturnType<typeof loadMediaLibrary>> | undefined;

export default function CanvasMediaLibraryHost({projectId,pending,onDelivered}:{projectId:string;pending:PendingMediaInsert|null;onDelivered:(value:null)=>void}) {
  const [notice,setNotice] = useState('');
  const [MediaLibrary, setMediaLibrary] = useState<typeof LazyMediaLibrary | NonNullable<typeof preloadedMediaLibrary>['default'] | null>(null);
  const open = MediaLibrary !== null;
  const [dragging,setDragging] = useState(false);
  const sent = useRef('');
  const native = useRef<{nodeId?: string}|null>(null);
  useEffect(() => {
    const preload = () => {
      // A failed background load is handled by lazyWithRetry when the library opens.
      void loadMediaLibrary().then(module => { preloadedMediaLibrary = module; }, () => {});
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preload, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 0);
    return () => clearTimeout(id);
  }, []);

  const insertNative = (item: LibraryMedia, nodeId?: string) => {
    const media = canvasLibraryMedia(item);
    if (!media) return false;
    const store = useCanvasStore.getState();
    const project = store.projects.find(row=>row.id===projectId);
    if (!project) return false;
    if (nodeId) {
      const node = project.nodes.find(row=>row.id===nodeId);
      if (!node || (node.type !== 'file' && !node.mediaUpload) || node.layerLocked) return false;
      const mismatch = canvasWorkflowUploadError(canvasWorkflowUploadSlot(project, nodeId), media.type);
      if (mismatch) throw new Error(mismatch);
      store.updateNode(projectId,nodeId,{ ...media, mediaUpload: true, width: 250, height: media.type === 'audio' ? 86 : 250, resultWidth: undefined, resultHeight: undefined });
    } else {
      const viewport = document.querySelector('[data-testid="canvas-viewport"]');
      const view = project.viewport || {x:0,y:0,zoom:1};
      const x = ((viewport?.clientWidth || 900)/2-view.x)/view.zoom-160;
      const y = ((viewport?.clientHeight || 600)/2-view.y)/view.zoom-120;
      store.addNode(projectId,{...media,x,y,width:320,height:240});
    }
    return true;
  };
  useEffect(()=>{
    const receive = (event:MessageEvent) => {
      if (event.origin!==location.origin || event.source!==window || event.data?.kind!=='canvas:library-open') return;
      setNotice('');
      native.current={nodeId:typeof event.data.nodeId==='string'?event.data.nodeId:undefined};
      setDragging(false);
      setMediaLibrary(() => preloadedMediaLibrary?.default ?? LazyMediaLibrary);
    };
    window.addEventListener('message',receive);
    if (pending?.projectId===projectId && sent.current !== pending.requestId) {
      sent.current = pending.requestId;
      const { name, kind, url, cover } = pending.item;
      useCanvasStore.getState().addNode(projectId, {
        type: kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'image',
        title: name || '资产素材',
        imageUrl: kind === 'video' ? cover : url,
        videoUrl: kind === 'video' ? url : undefined,
        audioUrl: kind === 'audio' ? url : undefined,
        x: 160,
        y: 160,
        width: 320,
        height: 240,
      });
      onDelivered(null);
    }
    return ()=>window.removeEventListener('message',receive);
  },[projectId,pending,onDelivered]);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    dialog.current?.focus();
  },[open]);
  function insert(item:LibraryMedia) {
    try {
      if (insertNative(item,native.current?.nodeId)) { setMediaLibrary(null);setDragging(false); }
      else setNotice('目标节点或素材已失效');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法使用此素材');
    }
  }
  if (!MediaLibrary) return null;
  return <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="画布素材库" className={dragging?'bml-modal is-dragging':'bml-modal'}
    onMouseDown={e=>{if(e.target===e.currentTarget)setMediaLibrary(null);}}>
    {notice && <p role="alert" className="absolute top-3 z-50 rounded-lg bg-zinc-900 p-2 text-white">{notice}</p>}
    <Suspense fallback={<p role="status">正在打开素材库…</p>}><MediaLibrary onClose={()=>setMediaLibrary(null)} onInsert={insert} onDragChange={setDragging} /></Suspense>
  </div>;
}
