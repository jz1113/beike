import type { StudioScene } from './types';

type Kind='image'|'video'|'audio';
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
