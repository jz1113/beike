import { replaceCustomMediaFile, preserveReplacedMediaPlacement, libraryMediaKey } from '@client/features/assets/model/customAssetStore';
import { updateSalesMaterial, updateSalesSound } from '@client/features/sales/api/salesMaterials';
import { fetchAssetDetail, invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import type { MediaKind, MediaSource } from './mediaIndex';

export function validateReplacementFile(file:File, kind:MediaKind) {
  if (!file.size) throw new Error('请选择非空文件');
  const extensions = {image:/\.(png|jpe?g|webp|gif|avif|bmp|heic)$/i,video:/\.(mp4|mov|webm|m4v|avi)$/i,audio:/\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i};
  if (file.type ? !file.type.startsWith(kind+'/') : !extensions[kind].test(file.name)) {
    throw new Error('请选择相同类型的素材文件');
  }
}

/** Patch only file references. Asset identity, name and classification never enter the write. */
export function replacementFields(type:'persona'|'scene'|'action', detail:Record<string,unknown>, oldUrl:string, newUrl:string) {
  const patch:Record<string,unknown> = {};
  function replace(value:unknown):unknown {
    if (value === oldUrl) return newUrl;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replace(item)]));
    return value;
  }
  const fields = type === 'persona' ? ['avatarUrl'] : type === 'scene' ? ['coverUrl'] : ['coverUrl','mediaUrl','sourceUrl'];
  for (const field of fields) if (detail[field] === oldUrl) patch[field] = newUrl;
  for (const field of ['sourceImages','dimensions']) {
    const raw = detail[field];
    if (typeof raw !== 'string' || !raw) continue;
    let parsed:unknown;
    try { parsed=JSON.parse(raw); } catch { throw new Error('素材详情格式异常，无法安全替换'); }
    // Dimensions contain descriptive/provenance data too; only named media views are writable here.
    const updated = field === 'dimensions' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? {...parsed,...Object.fromEntries(['personaViews','sceneViews'].filter(key=>key in parsed).map(key=>[key,replace((parsed as Record<string,unknown>)[key])]))}
      : field === 'sourceImages' ? replace(parsed) : parsed;
    if (JSON.stringify(updated) !== JSON.stringify(parsed)) patch[field] = JSON.stringify(updated);
  }
  if (!Object.keys(patch).length) throw new Error('素材已变化，请刷新后重试');
  return patch;
}

export async function replaceLibraryMedia(source:MediaSource, kind:MediaKind, oldUrl:string, file:File) {
  validateReplacementFile(file,kind);
  if (source.type === 'script') throw new Error('脚本不支持替换原文件');
  const detail = source.type !== 'local' && source.type !== 'sound' ? await fetchAssetDetail(source.type,source.id) : null;
  if (source.type !== 'local' && source.type !== 'sound' && !detail) throw new Error('无法读取素材详情，请刷新后重试');
  if (detail && source.type !== 'local' && source.type !== 'sound') replacementFields(source.type,detail,oldUrl,oldUrl+'#replacement-check');
  const newUrl = await uploadStudioFile(file,'canvas-library');
  if (source.type === 'local') {
    replaceCustomMediaFile(source.id,oldUrl,newUrl,kind);
    return;
  }
  // Preserve URL-based category overrides before cache invalidation reloads the card.
  preserveReplacedMediaPlacement(source.type+':'+source.id,libraryMediaKey({kind,url:oldUrl}));
  if (source.type === 'sound') await updateSalesSound(source.id,{audioUrl:newUrl});
  else await updateSalesMaterial(source.type,source.id,replacementFields(source.type,detail!,oldUrl,newUrl));
  invalidateGlobalAssetCache();
}
