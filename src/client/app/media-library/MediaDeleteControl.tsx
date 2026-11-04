import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteSalesMaterial, deleteSalesSound } from '@client/features/sales/api/salesMaterials';
import { deleteSalesScript } from '@client/features/sales/api/salesScripts';
import { deleteCustomAsset, readMediaFolders } from '@client/features/assets/model/customAssetStore';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { MediaSource } from './mediaIndex';

export function MediaDeleteControl({sources, folder, onNotice, onDeleted}: {
  sources:MediaSource[];
  onDeleted?:()=>void;
  folder:string;
  onNotice:(notice:string)=>void;
}) {
  const [busy,setBusy] = useState(false);
  const choices = sources.filter(source => !folder || source.folder === folder || source.folder.startsWith(folder+'/'));
  async function remove(source:MediaSource) {
    if (busy) return;
    setBusy(true);
    try {
      const collection = source.type === 'local' && readMediaFolders().includes(source.folder);
      const description = collection ? '将移除此文件夹中的收藏。' :
        source.type === 'local' ? '将删除本机素材目录中的这条记录。' :
        source.type === 'scene' ? '将从工作区删除整个场景及其所有视角。' : '将从工作区删除这条资产记录。';
      if (!await confirmAction({title:'删除「'+source.name+'」？', description:source.folder+'。'+description, danger:true})) return;
      if (source.type === 'local') {
        if (!deleteCustomAsset(source.id)) throw new Error('本机素材删除失败');
      } else if (source.type === 'script') {
        await deleteSalesScript(source.id);
        invalidateGlobalAssetCache();
      } else if (source.type === 'sound') {
        await deleteSalesSound(source.id);
        invalidateGlobalAssetCache();
      } else {
        await deleteSalesMaterial(source.type,source.id);
      }
      onDeleted?.();
      onNotice('已从「'+source.folder+'」删除「'+source.name+'」');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '素材删除失败');
    } finally {
      setBusy(false);
    }
  }
  if (!choices.length) return null;
  if (choices.length === 1) {
    const source = choices[0];
    return <button className="bml-remove" disabled={busy} title={'删除 '+source.name} aria-label={'删除 '+source.name}
      onClick={()=>void remove(source)}><Trash2 size={14}/>删除</button>;
  }
  return <select className="bml-remove-source" aria-label="选择要删除的素材记录" disabled={busy} value=""
    onChange={event=>{const source=choices[Number(event.target.value)]; if(source) void remove(source);}}>
    <option value="" disabled>删除…</option>
    {choices.map((source,index)=><option key={source.type+source.id} value={index}>{source.folder} · {source.name}</option>)}
  </select>;
}
