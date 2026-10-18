import { drawingGeometry } from './drawingGeometry';
import type { CanvasNode, CanvasEdge, CanvasPortType, NodeRunHistory } from './types';

export const isTextSource = (node: CanvasNode) => node.type === 'prompt' || node.type === 'note';
export const canReference = (node: CanvasNode) => Boolean(node.generationKind !== 'video' && node.imageUrl && !node.missingMedia && (node.type === 'image' || node.type === 'drawing'));
export const canReferenceVideo = (node: CanvasNode) => Boolean(node.videoUrl && !node.missingMedia && (node.type === 'video' || node.generationKind === 'video'));
export const canReferenceAudio = (node: CanvasNode) => Boolean(node.audioUrl && (node.type === 'audio' || Boolean(node.drawing?.audio)));
export const canConnect = (node: CanvasNode) => isTextSource(node) || node.type === 'drawing' || node.type === 'compare' || node.type === 'preview' || canReference(node) || canReferenceVideo(node) || canReferenceAudio(node);
export const referenceReady = (node: CanvasNode) => isTextSource(node) ? Boolean(node.content?.trim()) : canReference(node) || canReferenceVideo(node) || canReferenceAudio(node) || node.type === 'compare';

export interface CanvasPortDefinition {
  id: string;
  label: string;
  type: CanvasPortType;
  position: 'left' | 'right' | 'top' | 'bottom';
  offsetY?: number;
}

export function getNodeOutputPorts(node: CanvasNode): CanvasPortDefinition[] {
  if (node.type === 'prompt' || node.type === 'note') {
    return [{ id: 'output-text', label: '提示词文本', type: 'prompt', position: 'right' }];
  }
  if (node.type === 'audio') {
    return [{ id: 'output-audio', label: '音频流', type: 'audio', position: 'right' }];
  }
  if (node.type === 'video' || node.generationKind === 'video') {
    return [
      { id: 'output-video', label: '视频流', type: 'video', position: 'right' },
      { id: 'output-video-audio', label: '原声分轨', type: 'audio', position: 'bottom' },
    ];
  }
  if (node.type === 'compare') {
    return [{ id: 'output-compare', label: '对比产物', type: 'image', position: 'right' }];
  }
  if (node.type === 'preview') {
    return [{ id: 'output-preview', label: '透传监控流', type: 'any', position: 'right' }];
  }
  if (node.type === 'save') {
    return [];
  }
  // Default image source or image drawing
  return [{ id: 'output-image', label: '图像输出', type: 'image', position: 'right' }];
}

export function getNodeInputPorts(node: CanvasNode): CanvasPortDefinition[] {
  if (node.type === 'compare') {
    return [
      { id: 'input-compare-before', label: '原图/修前', type: 'image', position: 'left', offsetY: 60 },
      { id: 'input-compare-after', label: '对比图/修后', type: 'image', position: 'left', offsetY: 120 },
    ];
  }
  if (node.type === 'save') {
    return [
      { id: 'input-save-media', label: '待导出媒体', type: 'any', position: 'left', offsetY: 80 },
    ];
  }
  if (node.type === 'preview') {
    return [
      { id: 'input-preview-media', label: '视频/画面流', type: 'any', position: 'left', offsetY: 80 },
    ];
  }
  if (node.type !== 'drawing') return [];
  if (node.generationKind === 'video') {
    return [
      { id: 'input-prompt', label: '提示词', type: 'prompt', position: 'left', offsetY: 30 },
      { id: 'input-first-frame', label: '首帧/垫图', type: 'image', position: 'left', offsetY: 70 },
      { id: 'input-video-ref', label: '参考视频', type: 'video', position: 'left', offsetY: 110 },
      { id: 'input-audio', label: '伴奏/音效', type: 'audio', position: 'left', offsetY: 150 },
    ];
  }
  return [
    { id: 'input-prompt', label: '提示词', type: 'prompt', position: 'left', offsetY: 40 },
    { id: 'input-ref-image', label: '参考垫图', type: 'image', position: 'left', offsetY: 90 },
  ];
}

export function syncEdgesWithNodeReferences(nodes: CanvasNode[], existingEdges?: CanvasEdge[]): CanvasEdge[] {
  const edgeMap = new Map<string, CanvasEdge>();
  (existingEdges || []).forEach(edge => {
    edgeMap.set(`${edge.sourceNodeId}->${edge.targetNodeId}`, edge);
  });

  const synced: CanvasEdge[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  nodes.forEach(target => {
    (target.referenceNodeIds || []).forEach(sourceId => {
      const source = nodeMap.get(sourceId);
      if (!source) return;
      const key = `${sourceId}->${target.id}`;
      const existing = edgeMap.get(key);
      if (existing) {
        synced.push(existing);
      } else {
        const outPorts = getNodeOutputPorts(source);
        const inPorts = getNodeInputPorts(target);
        synced.push({
          id: `edge-${sourceId}-${target.id}`,
          sourceNodeId: sourceId,
          sourceHandle: outPorts[0]?.id || 'output',
          targetNodeId: target.id,
          targetHandle: inPorts.find(p => p.type === outPorts[0]?.type)?.id || inPorts[0]?.id || 'input',
          createdAt: Date.now(),
        });
      }
    });
  });

  return synced;
}

export function appendNodeRun(
  node: CanvasNode,
  run: Omit<NodeRunHistory, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): Partial<CanvasNode> {
  const newRun: NodeRunHistory = {
    id: run.id || `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId: run.taskId,
    imageUrl: run.imageUrl,
    videoUrl: run.videoUrl,
    audioUrl: run.audioUrl,
    prompt: run.prompt,
    model: run.model,
    status: run.status,
    createdAt: run.createdAt || Date.now(),
  };

  const runs = [newRun, ...(node.runs || [])].slice(0, 20);
  return {
    runs,
    activeRunIndex: 0,
    imageUrl: newRun.imageUrl ?? node.imageUrl,
    videoUrl: newRun.videoUrl ?? node.videoUrl,
    audioUrl: newRun.audioUrl ?? node.audioUrl,
  };
}

export function rollbackNodeRun(node: CanvasNode, runIndex: number): Partial<CanvasNode> | null {
  if (!node.runs || !node.runs[runIndex]) return null;
  const targetRun = node.runs[runIndex];
  return {
    activeRunIndex: runIndex,
    imageUrl: targetRun.imageUrl,
    videoUrl: targetRun.videoUrl,
    audioUrl: targetRun.audioUrl,
  };
}

export function nodeBounds(node: CanvasNode) {
  if (node.type === 'drawing') {
    const size = drawingGeometry(node);
    return { x: node.x + (node.width - size.width) / 2, y: node.y, ...size };
  }
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}
export function connectionError(nodes: CanvasNode[], sourceId: string, targetId: string, edges?: { sourceNodeId: string; targetNodeId: string }[]) {
  const source = nodes.find(node => node.id === sourceId);
  const target = nodes.find(node => node.id === targetId);
  const validTargetTypes = ['drawing', 'compare', 'save', 'preview'];
  if (!source || !target || !canConnect(source) || !validTargetTypes.includes(target.type)) {
    return '请选择生成、对比、监视或保存节点作为下一步';
  }
  if (canReferenceVideo(source) && target.type === 'drawing' && target.generationKind !== 'video') {
    return '视频素材请连接到视频生成节点';
  }
  if (source.layerLocked || target.layerLocked) return '请先解锁节点';
  if (sourceId === targetId) return '不能连接节点自身';
  if (target.referenceNodeIds?.includes(sourceId)) return '这两个节点已经连接';
  const visited = new Set<string>();
  const upstream = (id: string) => {
    const refs = nodes.find(node => node.id === id)?.referenceNodeIds || [];
    const viaEdges = (edges || []).filter(edge => edge.targetNodeId === id).map(edge => edge.sourceNodeId);
    return [...refs, ...viaEdges];
  };
  const reaches = (id: string): boolean => {
    if (id === targetId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return upstream(id).some(reaches);
  };
  return reaches(sourceId) ? '这条连线会形成循环，请选择其他节点' : '';
}
export function linkedPrompt(node: CanvasNode, nodes: CanvasNode[]) {
  return [...(node.referenceNodeIds || []).map(id => nodes.find(item => item.id === id))
    .filter((item): item is CanvasNode => !!item && isTextSource(item)).map(item => item.content?.trim()), node.content?.trim()].filter(Boolean).join('\n\n');
}
