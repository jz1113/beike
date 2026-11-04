import { useEffect, useRef, useState } from 'react';
import { mediaFolderKinds, moveLibraryMedia } from '@client/features/assets/model/customAssetStore';
import type { LibraryEntry } from './mediaIndex';

export function MediaMoveDialog({items,source,folders,onClose,onMoved}:{
  items:LibraryEntry[]; source:string; folders:string[]; onClose:()=>void; onMoved:(path:string)=>void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [destination,setDestination] = useState('');
  const [error,setError] = useState('');
  const targets = folders.filter(path=>{
    const kind = mediaFolderKinds[path.split('/')[0]];
    return path !== source && (!kind || items.every(item=>item.kind === kind));
  });
  const target = targets.includes(destination) ? destination : targets[0] || '';
  useEffect(()=>{
    const element = dialog.current;
    element?.showModal();
    return ()=>element?.close();
  },[]);
  return <dialog ref={dialog} className="bml-move-dialog" aria-label="移动素材到分类" onCancel={onClose}>
    <form onSubmit={event=>{
      event.preventDefault();
      try { moveLibraryMedia(items,source,target,folders); onMoved(target); }
      catch(cause){setError(cause instanceof Error ? cause.message : '移动失败，请重试');}
    }}>
      <h3>移动 {items.length} 项素材</h3>
      <p>{source ? '从「'+source+'」移动，其他分类中的归属保留。' : '将所选素材统一归入目标分类。'}</p>
      {targets.length ? <label>目标分类<select autoFocus aria-label="素材移动目标分类" value={target}
        onChange={event=>{setDestination(event.target.value);setError('');}}>
        {targets.map(path=><option key={path} value={path}>{path}</option>)}
      </select></label> : <p>没有适合这些素材的目标分类，请先新建分类。</p>}
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={!target}>移动</button></footer>
    </form>
  </dialog>;
}
