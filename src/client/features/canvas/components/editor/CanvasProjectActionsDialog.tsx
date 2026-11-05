import { useRef, useState } from 'react';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { deleteCanvasProject, saveCanvasProjects, useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasProject } from '../../model/types';

export function CanvasProjectActionsDialog({project,onClose,onHome,onSave}: {
  project:CanvasProject; onClose:()=>void; onHome:()=>void; onSave:()=>Promise<void>;
}) {
  const [title,setTitle] = useState(project.title);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const lock = useRef(false);
  const dialog = useModalDialog(true,()=>{if(!lock.current)onClose();});
  async function run(kind:'save'|'copy'|'delete') {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try {
      if(kind==='delete') {
        if(!await confirmAction({title:'删除画布项目',description:`删除「${project.title}」及其中的节点和连线？此操作无法撤销。`,confirmText:'删除项目',danger:true}))return;
        await deleteCanvasProject(project.id);onHome();
      } else {
        const next=title.trim();
        if(!next)throw new Error('请输入项目名称');
        useCanvasStore.getState().updateProjectTitle(project.id,next);
        await onSave();
        if(kind==='copy') {
          const copy=await useCanvasStore.getState().duplicateProject(project.id);
          await saveCanvasProjects();useCanvasStore.getState().selectProject(copy.id);
        }
        onClose();
      }
    } catch(cause){setError(cause instanceof Error ? cause.message : '项目操作失败，请重试');}
    finally{lock.current=false;setBusy(false);}
  }
  return <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-2">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="画布项目" tabIndex={-1}
      onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();void run('save');}}}
      className="grid max-h-[85dvh] w-full max-w-sm gap-3 overflow-auto rounded-xl border border-white/20 bg-[#202023] p-4 text-sm text-stone-200">
      <h2 className="font-semibold">画布项目</h2>
      <label className="grid gap-1">项目名称<input aria-label="项目名称" maxLength={40} value={title}
        className="min-w-0 rounded border border-white/20 bg-transparent px-2 py-2" onChange={event=>setTitle(event.target.value)}
        onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();void run('save');}}}/></label>
      {error&&<p role="alert" className="break-words text-red-300">{error}</p>}
      <button disabled={busy} className="rounded-lg border border-white/20 p-2" onClick={()=>void run('save')}>保存项目</button>
      <button disabled={busy} className="rounded-lg border border-white/20 p-2" onClick={()=>void run('copy')}>复制项目</button>
      <button disabled={busy} className="rounded-lg border border-red-400/30 p-2 text-red-300" onClick={()=>void run('delete')}>删除项目</button>
      <button disabled={busy} className="rounded-lg p-2 hover:bg-white/10" onClick={onHome}>返回首页</button>
      <button disabled={busy} className="rounded-lg p-2 hover:bg-white/10" onClick={onClose}>取消</button>
    </div>
  </div>;
}
