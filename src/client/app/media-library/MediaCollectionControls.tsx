import { useState } from 'react';
import { collectCustomMedia, removeCollectedMedia, mediaFolderKinds } from '@client/features/assets/model/customAssetStore';
import type { LibraryEntry } from './mediaIndex';


export function MediaCollectionControls({item,folder,saved,onDone}:{
  item:LibraryEntry; folder:string; saved:string[]; onDone:(message:string,path:string)=>void;
}) {
  const paths = saved.filter(path=>{
    const kind = mediaFolderKinds[path.split('/')[0]];
    return !kind || item.kind === kind;
  });
  const [selected,setSelected] = useState('');
  const [error,setError] = useState('');
  const target = paths.includes(selected) ? selected : paths[0];
  if (!target) return null;
  return <div className="bml-collect">
    <select aria-label="目标文件夹" value={target} onChange={e=>setSelected(e.target.value)}>{paths.map(path=><option key={path}>{path}</option>)}</select>
    <button onClick={()=>{try{collectCustomMedia(item.name,item.url,item.kind,target);onDone('素材已加入文件夹',target);}
      catch(cause){setError(cause instanceof Error ? cause.message : '收藏未保存');}}}>加入文件夹</button>
    {saved.includes(folder) && item.folders.includes(folder) && <button onClick={()=>{try{removeCollectedMedia(item.url,folder);onDone('已从文件夹移出',folder);}
      catch{setError('移出失败');}}}>移出此文件夹</button>}
    {error && <small role="alert">{error}</small>}
  </div>;
}
