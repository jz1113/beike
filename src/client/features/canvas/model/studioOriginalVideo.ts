import { studioNodeKind, studioNodeLabel, studioNodeMedia, studioEdgeSources } from './studioConnections';
import type { StudioScene } from './types';

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
