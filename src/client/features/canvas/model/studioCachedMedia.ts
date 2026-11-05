/** Rebuild display references from this project's retained files before mounting the renderer. */
export async function restoreStudioCachedMedia(value: unknown, hasAsset: (id: string) => Promise<boolean>): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map(item=>restoreStudioCachedMedia(item,hasAsset)));
  if (!value || typeof value!=='object') return value;
  const object=Object.fromEntries(await Promise.all(Object.entries(value).map(async([key,item])=>
    [key,await restoreStudioCachedMedia(item,hasAsset)])));
  if (/^(text-node|prompt|note|text|label)$/.test(String(object.type || ''))) return object;
  const settings=object.settings as Record<string,unknown> | undefined;
  const needsRecovery=(field:string)=>typeof object[field]==='string' && (!object[field] || object[field].startsWith('blob:'));
  async function recover(fields:string[],ids:unknown[],missingContent=false) {
    if (!missingContent && !fields.some(needsRecovery)) return;
    for (const id of ids) {
      if (typeof id!=='string' || !id || !await hasAsset(id)) continue;
      const ref=`local-asset://${encodeURIComponent(id)}`;
      for (const field of fields) if (needsRecovery(field)) object[field]=ref;
      if (missingContent) object.content=ref;
      break;
    }
  }
  await recover(['content','url','originalUrl','fullUrl','imageUrl','videoUrl','audioUrl','_blobUrl'],
    [object.assetId,object._contentAssetId,object._localCacheAssetId,object._assetId,
      settings?._localCacheAssetId,settings?._contentAssetId,settings?._assetId],
    !object.content && /^(input-image|gen-image|gen-video|video-input|preview|gen-speech|gen-music)$/.test(String(object.type)));
  await recover(['selectedPreviewImage'],[object._selectedImageAssetId]);
  await recover(['selectedPreviewVideo'],[object._selectedVideoAssetId]);
  // A video's poster belongs to its own image cache, never to the video's cache ID.
  await recover(['thumbnailUrl','videoPosterUrl','_canvasDisplayPreviewUrl'],
    [object.previewAssetId,object._thumbnailAssetId,settings?._thumbnailAssetId]);
  return object;
}
