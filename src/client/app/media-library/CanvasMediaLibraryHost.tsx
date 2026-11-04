import { Suspense, useEffect, useRef, useState } from 'react';
import { collectCustomMedia } from '@client/features/assets/model/customAssetStore';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { lazyWithRetry } from '../lazyWithRetry';

const MediaLibrary = lazyWithRetry(() => import('./MediaLibrary'));
import type { LibraryMedia, MediaKind, PendingMediaInsert } from './mediaIndex';

type SavedMedium = {name:string;kind:MediaKind;url?:string;file?:Blob};

export default function CanvasMediaLibraryHost({projectId,pending,onDelivered}:{projectId:string;pending:PendingMediaInsert|null;onDelivered:(value:null)=>void}) {
  const [open,setOpen] = useState(false);
  const [dragging,setDragging] = useState(false);
  const frame = useRef<Window|null>(null);
  const sent = useRef('');
  useEffect(()=>{
    const receive = async (event:MessageEvent) => {
      const current = document.querySelector<HTMLIFrameElement>('iframe[title="贝壳云图项目画布"]')?.contentWindow;
      if (!current || event.origin !== location.origin || event.source !== current || event.data?.projectId !== projectId) return;
      frame.current = current;
      if (event.data.kind==='studio:library-open') {setDragging(false);setOpen(true);}
      if (event.data.kind==='studio:library-ready' && pending?.projectId===projectId && sent.current!==pending.requestId) {
        sent.current=pending.requestId;
        current.postMessage({...pending,kind:'studio:library-insert'},location.origin);
      }
      if (event.data.kind==='studio:library-inserted') {
        setOpen(false);setDragging(false);
        if (pending && event.data.requestId===pending.requestId) onDelivered(null);
      }
      if (event.data.kind==='studio:library-save') {
        let saved=0;
        try {
          for (const item of event.data.items as SavedMedium[]) {
            if (!['image','video','audio'].includes(item.kind)) throw new Error('不支持的素材类型');
            const url=item.file ? await uploadStudioFile(new File([item.file],item.name,{type:item.file.type}),'canvas-library') : item.url;
            if (!url || !/^(https?:\/\/|\/api\/sales\/bgm\/|\/storage\/)/i.test(url)) throw new Error('素材地址已失效');
            collectCustomMedia(item.name,url,item.kind,'画布收藏',false);saved++;
          }
          current.postMessage({kind:'studio:library-feedback',message:`已收藏 ${saved} 项素材`},location.origin);
        } catch(error) {
          current.postMessage({kind:'studio:library-feedback',error:true,message:`已收藏 ${saved} 项。 ${error instanceof Error?error.message:'素材保存失败'}`},location.origin);
        }
      }
    };
    window.addEventListener('message',receive);
    if (pending?.projectId===projectId) {
      document.querySelector<HTMLIFrameElement>('iframe[title="贝壳云图项目画布"]')?.contentWindow?.postMessage({kind:'studio:library-ping',projectId},location.origin);
    }
    return ()=>window.removeEventListener('message',receive);
  },[projectId,pending,onDelivered]);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    dialog.current?.focus();
    return ()=>{frame.current?.focus();};
  },[open]);
  function insert({name,kind,url}:LibraryMedia) {
    frame.current?.postMessage({kind:'studio:library-insert',projectId,item:{name,kind,url}},location.origin);
  }
  if(!open)return null;
  return <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="画布素材库" className={dragging?'bml-modal is-dragging':'bml-modal'}
    onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
    <Suspense fallback={<p role="status">正在打开素材库…</p>}><MediaLibrary onClose={()=>setOpen(false)} onInsert={insert} onDragChange={setDragging} onRoleResources={()=>{
      setOpen(false);
      frame.current?.postMessage({kind:'studio:panel',panel:'role-resources'},location.origin);
    }}/></Suspense>
  </div>;
}
