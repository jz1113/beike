import type { StudioScene } from './types';
import { studioMediaKind } from './studioMediaKind';
import { studioNodeMedia } from './studioConnections';

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
