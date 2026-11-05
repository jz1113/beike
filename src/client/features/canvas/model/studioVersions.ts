import type { StudioScene } from './types';

type Node = StudioScene['nodes'][number];
const oldMediaFields = ['_contentAssetId','_localCacheAssetId','_assetId','_ossRemoteUrl','_ossThumbnailUrl',
  'mjImages','previewMjImages','batchImages','_mjAssetIds','_mjPreviewAssetIds','previewMjOssRemoteUrls','videoPosterUrl'];

/** A completed host task owns a new result identity, independent of the previous display cache. */
export function recordStudioResultVersion(previous: Node, next: Node, previousVersions: Record<string, unknown>[]): Node {
  const video = next.type === 'gen-video';
  const url = video ? next.videoUrl || next.content : next.imageUrl || next.content;
  if (typeof url !== 'string' || !url) return next;
  const settings = {...(next.settings as Record<string, unknown> || {})};
  for (const key of oldMediaFields) delete settings[key];
  delete settings._preGenerateSnapshot;
  const id = String(previous.beikeTaskId || crypto.randomUUID());
  const createdAt = Date.now();
  const images = [{id,fullUrl:url,thumbUrl:video?'':url,createdAt}];
  const recipe = {...settings};
  for (const key of ['generationVersions','activeGenerationVersionIndex','generatedImages','isGenerating','progress','error']) delete recipe[key];
  const version = {id,createdAt,mediaType:video?'video':'image',content:url,originalUrl:url,
    thumbnailUrl:video?'':url,generatedImages:images,recipe:{prompt:next.prompt || '',settings:recipe}};
  const versions = [...structuredClone(previousVersions).slice(-199),version];
  return {...next,assetId:undefined,_contentAssetId:undefined,previewAssetId:undefined,videoPosterUrl:undefined,
    ...(video ? {imageUrl:undefined} : {}),generatedImages:images,
    settings:{...settings,generatedImages:images,generationVersions:versions,activeGenerationVersionIndex:versions.length-1}};
}
