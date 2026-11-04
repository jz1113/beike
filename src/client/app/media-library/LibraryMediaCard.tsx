import { memo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { MediaDeleteControl } from './MediaDeleteControl';
import type { SalesLibraryChoice } from '@client/features/sales/model/salesWorkspace';
import type { LibraryMedia, LibraryEntry } from './mediaIndex';

export const mediaDragType = 'application/x-beike-library-media';
export const mediaLabels = {all:'全部', image:'图片', video:'视频', audio:'音频', script:'脚本'};

function libraryThumbnail(url:string, width:number) {
  const src = proxyMediaUrl(url,{thumb:true,width});
  if (src.startsWith('/storage/') || /^https?:\/\/[^/]+\/storage\//i.test(src)) {
    const local = new URL(src,window.location.origin);
    local.searchParams.set('thumb','1');
    local.searchParams.set('w',String(width));
    return local.href;
  }
  return src;
}

export const LibraryMediaCard = memo(function LibraryMediaCard({item, folder, onNotice, onPreview, onInsert, onDragChange, onSelectSales, selected, onToggleSelected, onMove}: {
  item:LibraryEntry;
  selected?:boolean; onToggleSelected?:()=>void; onMove?:()=>void;
  folder:string;
  onNotice:(notice:string)=>void;
  onSelectSales?:(choice:SalesLibraryChoice)=>void;
  onPreview:(item:LibraryEntry)=>void;
  onInsert?:(item:LibraryMedia)=>void;
  onDragChange?:(dragging:boolean)=>void;
}) {
  const [selectedUrl,setSelectedUrl] = useState('');
  const views = item.views ?? [];
  const index = Math.max(0, views.findIndex(angle => angle.url === selectedUrl));
  const view = views[index];
  const sceneFolder = item.folders.find(folder => folder.startsWith('场景/'));
  const multiView = views.length > 1;
  const start = Math.floor(index / 3) * 3;
  function step(direction:number) {
    setSelectedUrl(views[(index + direction + views.length) % views.length].url);
  }
  const current = view && view.url !== item.url
    ? {...item, url:view.url, name:item.name+' · '+view.label, cover:undefined} : item;
  const choices = item.salesChoices ?? [];
  const thumbnail = view?.url || item.cover || (item.kind === 'image' ? item.url : '');
  const previewVideo = item.kind === 'script' ? item.record.depthVideoUrl : item.kind === 'video' ? item.url : '';
  return <article data-selected={selected || undefined} className={sceneFolder ? 'bml-scene' : undefined} draggable={!!onDragChange && current.kind !== 'script'} onDragStart={event => {
    if (current.kind === 'script') return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(mediaDragType, JSON.stringify({name:current.name, kind:current.kind, url:current.url}));
    requestAnimationFrame(() => onDragChange?.(true));
  }} onDragEnd={() => onDragChange?.(false)}>
    <div className="bml-card-media">
      <div className="bml-hero">
        <button className="bml-preview" aria-label={'预览 '+current.name} onClick={() => onPreview(current)}>
          {thumbnail ? <img src={libraryThumbnail(thumbnail,320)} draggable={false} loading="lazy" decoding="async" alt=""/>  : previewVideo ? <video src={proxyMediaUrl(previewVideo,{asVideo:true})} preload="metadata" muted playsInline aria-hidden/> : <span>{mediaLabels[item.kind]}</span>}
          {multiView && <span className="bml-view-position"><span>{view.label}</span><span>{index+1} / {views.length}</span></span>}
        </button>
        {multiView && <>
          <button className="bml-angle-step prev" aria-label="上一个视角" onClick={() => step(-1)}><ChevronLeft size={15}/></button>
          <button className="bml-angle-step next" aria-label="下一个视角" onClick={() => step(1)}><ChevronRight size={15}/></button>
        </>}
      </div>
      {multiView && <div className="bml-angles" role="group" aria-label={item.name+'的视角'}>
        {views.slice(start,start+3).map(angle => <button key={angle.url} title={angle.label} aria-label={angle.label}
          aria-pressed={angle.url === view.url} onClick={() => setSelectedUrl(angle.url)}>
          <img src={libraryThumbnail(angle.url,96)} draggable={false} loading="lazy" decoding="async" alt=""/>
        </button>)}
      </div>}
    </div>
    <div className="bml-caption"><strong title={item.name}>{item.name}</strong>
      <small>{sceneFolder ? sceneFolder.slice('场景/'.length)+'场景' : mediaLabels[item.kind]+' · '+item.folders[0]}</small>
    </div>
    <div className="bml-card-actions">
      {onToggleSelected && <label className="bml-select-item"><input type="checkbox" aria-label={'选择 '+item.name}
        checked={!!selected} onChange={onToggleSelected}/>选择</label>}
      {onMove && <button className="bml-insert" aria-label={'移动 '+item.name} onClick={onMove}>移动到…</button>}
      {onSelectSales && choices.length ? <button className="bml-insert" onClick={()=>{
        if (choices.length > 1) onPreview(current);
        else onSelectSales(choices[0]);
      }}>用于视频制作</button> : current.kind === 'script' ? <button className="bml-insert" onClick={()=>onPreview(current)}>查看分镜脚本</button> : onInsert && <button className="bml-insert" onClick={() => onInsert(current)}>放入画布</button>}
      {item.sources && <MediaDeleteControl sources={item.sources} folder={item.classificationMoved ? '' : folder} onNotice={onNotice}/>}
    </div>
  </article>;
});
