import { studioEdgeSources, studioNodeKind, studioNodeLabel, studioNodeMedia } from './studioConnections';
import type { StudioScene } from './types';

type Kind='image'|'video'|'audio';
type Node = StudioScene['nodes'][number];

/** Opaque browser/cache URLs carry no extension; use the source node's media metadata. */
export function studioMediaKind(node:StudioScene['nodes'][number]|undefined,url:string,declared?:Kind):Kind|undefined {
  const source=String(url||'').trim();
  const data=/^data:(image|video|audio)\//i.exec(source)?.[1]?.toLowerCase() as Kind|undefined;
  if(data)return data;
  const path=source.split(/[?#]/)[0];
  if(/\.(?:png|jpe?g|webp|gif|avif|bmp)$/i.test(path))return 'image';
  if(/\.(?:mp4|webm|mov|m4v|mkv)$/i.test(path))return 'video';
  if(/\.(?:mp3|wav|m4a|aac|flac|ogg)$/i.test(path))return 'audio';
  const settings=node?.settings as Record<string,unknown>|undefined;
  const metadata=node?.type==='preview' ? node.previewType||settings?.mediaType : settings?.mediaType||node?.previewType;
  if(metadata==='image'||metadata==='video'||metadata==='audio')return metadata;
  if(node?.type==='gen-video'||node?.type==='video-input')return 'video';
  if(node?.type==='gen-speech'||node?.type==='gen-music')return 'audio';
  return declared;
}

/** Use an explicit raw-video connection first, then the configured template source. */
export function studioOriginalVideo(scene:StudioScene,targetId:string) {
  const target=scene.nodes.find(node=>node.id===targetId);
  const settings=target?.settings as Record<string,unknown>|undefined;
  const preferred=scene.nodes.find(node=>node.id===settings?.beikeOriginalNodeId);
  const connected=new Set(scene.connections.filter(edge=>edge.to===targetId && (!edge.inputType||edge.inputType==='default')).flatMap(edge=>studioEdgeSources(edge,scene)));
  const replacements=scene.nodes.filter(node=>connected.has(node.id) && ['input-image','video-input'].includes(node.type) && studioNodeKind(node)==='video');
  const source=replacements.length===1 ? replacements[0] : replacements.length ? undefined : preferred;
  if(!source || studioNodeKind(source)!=='video')throw new Error('请连接一份原始参考视频，或恢复原片节点，再回贴原声');
  if(source.isGenerating || source.missingMedia)throw new Error(`原片素材尚未就绪：${studioNodeLabel(source)}`);
  const media=studioNodeMedia(source);
  if(!media.url)throw new Error(`请先导入原始参考视频：${studioNodeLabel(source)}`);
  return {nodeId:source.id,type:'video' as const,...media};
}

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

export function connectedStudioPreview(scene:StudioScene,nodeId:string) {
  const node=syncStudioPreviews(scene).nodes.find(item=>item.id===nodeId);
  if(!node || node.type!=='preview')return;
  const media=studioNodeMedia(node),type=studioMediaKind(node,media.url);
  return media.url && type?{url:media.url,type}:undefined;
}

/** Follow a single connected result, including host-side local composition. */
export function syncStudioPreviews(scene:StudioScene):StudioScene {
  let changed=false;
  const nodes=scene.nodes.map(node=>{
    if(node.type!=='preview')return node;
    const sources=[...new Set(scene.connections.filter(edge=>edge.to===node.id).map(edge=>edge.from))];
    if(sources.length!==1)return node;
    const source=scene.nodes.find(item=>item.id===sources[0]);
    if(!source)return node;
    const media=studioNodeMedia(source),kind=studioMediaKind(source,media.url);
    if(!media.url || kind!=='video' && kind!=='image')return node;
    const settings=node.settings as Record<string,unknown> || {};
    // Preserve deliberate selections; only empty or previously linked previews follow.
    if(studioNodeMedia(node).url && settings.beikePreviewSourceId!==source.id)return node;
    if(studioNodeMedia(node).url===media.url && node.previewType===kind)return node;
    changed=true;
    return {...node,content:media.url,previewType:kind,selectedPreviewVideo:kind==='video'?media.url:undefined,
      selectedPreviewImage:kind==='image'?media.url:undefined,previewMjVideos:undefined,previewMjImages:undefined,
      _contentAssetId:undefined,_selectedImageAssetId:undefined,_selectedVideoAssetId:undefined,
      settings:{...settings,beikePreviewSourceId:source.id}};
  });
  return changed?{...scene,nodes}:scene;
}

/** Input media previews always read the source, regardless of the renderer's display-shell branch. */
export function normalizeStudioPreview(scene:StudioScene|undefined,item:Record<string,unknown>|null) {
  if(!scene || !item || typeof item.id!=='string')return item;
  const node=scene.nodes.find(node=>node.id===item.id || `${node.id}_lightbox`===item.id);
  if(!node || !['input-image','video-input'].includes(node.type))return item;
  const media=studioNodeMedia(node);
  const type=studioMediaKind(node,media.url);
  if(!media.url || type!=='video' && type!=='audio')return item;
  return {...item,type,url:media.url,originalUrl:media.url,title:node.nodeName || item.title,
    ...(media.assetId?{_assetId:media.assetId}:{})};
}
