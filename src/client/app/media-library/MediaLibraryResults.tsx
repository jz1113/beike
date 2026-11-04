import { useRef, useState } from 'react';
import { exportZipDownload, formatExportProgress } from '@client/shared/api/exportZipDownload';
import { getAssetDownloadExtension } from '@client/shared/utils/assetTaskData';
import { getMediaDownloadFilename } from '@shared/domain/media/mediaDownload';
import { libraryMediaKey } from '@client/features/assets/model/customAssetStore';
import { LibraryMediaCard } from './LibraryMediaCard';
import { MediaMoveDialog } from './MediaMoveDialog';
import type { LibraryMedia, LibraryEntry } from './mediaIndex';
import type { SalesLibraryChoice } from '@client/features/sales/model/salesWorkspace';

export function MediaLibraryResults({items,folder,folders,layout,size,onNotice,onMoved,onPreview,onInsert,onSelectSales,onDragChange}:{
  items:LibraryEntry[]; folder:string; folders:string[]; layout:'grid'|'list'; size:number;
  onNotice:(message:string)=>void; onMoved:(path:string)=>void; onPreview:(item:LibraryEntry)=>void;
  onInsert?:(item:LibraryMedia)=>void; onSelectSales?:(choice:SalesLibraryChoice)=>void; onDragChange?:(dragging:boolean)=>void;
}) {
  const [selected,setSelected] = useState<Set<string>>(new Set());
  const [moving,setMoving] = useState<LibraryEntry[]|null>(null);
  const [downloading,setDownloading] = useState(false);
  const [downloadProgress,setDownloadProgress] = useState('');
  const downloadLock = useRef(false);
  const chosen = items.filter(item=>selected.has(libraryMediaKey(item)));
  const downloadable = chosen.filter(item=>item.kind !== 'script');
  const allSelected = items.length > 0 && chosen.length === items.length;
  async function downloadSelected() {
    if (downloadLock.current || !downloadable.length) return;
    downloadLock.current = true;
    setDownloading(true);
    try {
      const images = downloadable.map((item,index)=>({url:item.url,
        filename:getMediaDownloadFilename(`${String(index+1).padStart(3,'0')}_${item.name.slice(0,60).replace(/[/\\?%*:|"<>]/g,'_')}`,
          '',`file.${getAssetDownloadExtension(item.kind,item.url)}`)}));
      const result = await exportZipDownload({images,folderName:'素材库'},'贝壳云图素材.zip',
        progress=>setDownloadProgress(formatExportProgress(progress)));
      onNotice(result.partial ? `已导出 ${result.succeeded} 项，${result.failed} 项失败；压缩包内附失败清单，可保留选择重试`
        : `已导出 ${downloadable.length} 项媒体，已发起浏览器下载`);
    } catch (error) {
      onNotice('批量下载失败：'+(error instanceof Error ? error.message : '请重试'));
    } finally {
      downloadLock.current = false;
      setDownloading(false);
      setDownloadProgress('');
    }
  }
  return <>
    {!!items.length && <div className="bml-batch-tools" aria-label="素材批量操作">
      <label><input type="checkbox" aria-label="全选当前结果" checked={allSelected}
        onChange={()=>setSelected(allSelected ? new Set() : new Set(items.map(libraryMediaKey)))}/>全选当前结果</label>
      <span>已选 {chosen.length} 项</span>
      <button disabled={!downloadable.length} aria-label="批量下载" aria-disabled={downloading}
        title={!downloadable.length ? '请选择图片、视频或音频' : undefined} onClick={()=>void downloadSelected()}>
        {downloading ? downloadProgress || '正在打包…' : '批量下载'}
      </button>
      <button disabled={!chosen.length || downloading} onClick={()=>setMoving(chosen)}>移动到分类…</button>
      {!!chosen.length && <button onClick={()=>setSelected(new Set())}>取消选择</button>}
    </div>}
    <div className={'bml-items '+layout} style={layout==='grid'?{gridTemplateColumns:`repeat(auto-fill,minmax(min(100%,${size}px),1fr))`}:undefined}>
      {items.map(item=>{
        const key = libraryMediaKey(item);
        return <LibraryMediaCard key={key} item={item} folder={folder} onNotice={onNotice}
          selected={selected.has(key)} onToggleSelected={()=>setSelected(current=>{
            const next = new Set(current); if(next.has(key)) next.delete(key); else next.add(key); return next;
          })} onMove={()=>setMoving([item])}
          onPreview={onPreview} onSelectSales={onSelectSales} onInsert={onInsert} onDragChange={onDragChange}/>;
      })}
    </div>
    {moving && <MediaMoveDialog items={moving} source={folder} folders={folders} onClose={()=>setMoving(null)}
      onMoved={path=>{setMoving(null);setSelected(new Set());onNotice('已移动 '+moving.length+' 项素材到「'+path+'」');onMoved(path);}}/>}
  </>;
}
