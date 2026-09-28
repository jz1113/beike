import { drawingGeometry } from './drawingGeometry';
import type { CanvasNode } from './types';

export const isTextSource = (node: CanvasNode) => node.type === 'prompt';
export const canReference = (node: CanvasNode) => Boolean(node.generationKind !== 'video' && node.imageUrl && !node.missingMedia && (node.type === 'image' || node.type === 'drawing'));
export const canReferenceVideo = (node: CanvasNode) => Boolean(node.videoUrl && !node.missingMedia && (node.type === 'video' || node.generationKind === 'video'));
export const canConnect = (node: CanvasNode) => isTextSource(node) || (node.type === 'drawing' && node.generationKind !== 'video') || canReference(node) || canReferenceVideo(node);
export const referenceReady = (node: CanvasNode) => isTextSource(node) ? Boolean(node.content?.trim()) : canReference(node) || canReferenceVideo(node);
export function nodeBounds(node: CanvasNode) {
  if (node.type === 'drawing') {
    const size = drawingGeometry(node);
    return { x: node.x + (node.width - size.width) / 2, y: node.y, ...size };
  }
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}
export function connectionError(nodes: CanvasNode[], sourceId: string, targetId: string) {
  const source = nodes.find(node => node.id === sourceId);
  const target = nodes.find(node => node.id === targetId);
  if (!source || !target || !canConnect(source) || target.type !== 'drawing') return '请选择图片生成或视频生成节点作为下一步';
  if (canReferenceVideo(source) && target.generationKind !== 'video') return '视频素材请连接到视频生成节点';
  if (source.layerLocked || target.layerLocked) return '请先解锁节点';
  if (sourceId === targetId) return '不能连接节点自身';
  if (target.referenceNodeIds?.includes(sourceId)) return '这两个节点已经连接';
  const visited = new Set<string>();
  const reaches = (id: string): boolean => {
    if (id === targetId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return (nodes.find(node => node.id === id)?.referenceNodeIds || []).some(reaches);
  };
  return reaches(sourceId) ? '这条连线会形成循环，请选择其他节点' : '';
}
export function linkedPrompt(node: CanvasNode, nodes: CanvasNode[]) {
  return [...(node.referenceNodeIds || []).map(id => nodes.find(item => item.id === id))
    .filter((item): item is CanvasNode => !!item && isTextSource(item)).map(item => item.content?.trim()), node.content?.trim()].filter(Boolean).join('\n\n');
}
