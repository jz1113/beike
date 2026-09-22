import { useCanvasStore } from '@/features/canvas/store/useCanvasStore';
import type { MediaAttachment } from '@/store/appStoreTypes';

function clipText(value: string | undefined, max: number): string | undefined {
  const clipped = (value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  return clipped || undefined;
}

export function useCanvasWorkspaceSelection() {
  const activeNodeId = useCanvasStore((state) => state.activeNodeId);
  const activeProject = useCanvasStore((state) =>
    state.projects.find((project) => project.id === state.activeProjectId),
  );
  return { activeNodeId, activeProject };
}

export function getCanvasWorkspaceSnapshot(): Record<string, unknown> {
  const canvasState = useCanvasStore.getState();
  const project = canvasState.projects.find((item) => item.id === canvasState.activeProjectId);
  if (!project) {
    return {
      workspaceType: 'canvas',
      title: '未打开画布',
      summary: '当前没有已打开的画布项目。',
      nodeCount: 0,
    };
  }

  const nodeTypes = project.nodes.reduce<Record<string, number>>((counts, node) => {
    counts[node.type] = (counts[node.type] || 0) + 1;
    return counts;
  }, {});
  const activeNode = canvasState.activeNodeId
    ? project.nodes.find((node) => node.id === canvasState.activeNodeId)
    : undefined;
  const nodes = project.nodes
    .filter((node) => !node.layerHidden)
    .filter((node) => node.id !== activeNode?.id)
    .slice(-8)
    .map((node) => ({
      type: node.type,
      title: clipText(node.title || node.content, 100),
      status: node.status,
    }));

  return {
    workspaceType: 'canvas',
    title: project.title,
    summary: `画布中有 ${project.nodes.length} 个节点。`,
    nodeCount: project.nodes.length,
    nodeTypes,
    selectedNode: activeNode
      ? {
          type: activeNode.type,
          title: clipText(activeNode.title || activeNode.content, 120),
          status: activeNode.status,
        }
      : undefined,
    nodes,
  };
}

export function getCanvasWorkspaceAttachments(): MediaAttachment[] {
  const canvasState = useCanvasStore.getState();
  const project = canvasState.projects.find((item) => item.id === canvasState.activeProjectId);
  const node = project?.nodes.find((item) => item.id === canvasState.activeNodeId);
  if (!node || node.layerHidden || !['image', 'video', 'drawing'].includes(node.type)) return [];

  const isVideo = node.type === 'video' || node.generationKind === 'video';
  const url = isVideo ? node.videoUrl || node.imageUrl : node.imageUrl || node.videoUrl;
  if (!url) return [];
  const title = clipText(
    node.title || node.content || (isVideo ? '画布视频节点' : '画布图片节点'),
    48,
  );
  return [{
    id: `canvas-node-${node.id}`,
    type: isVideo ? 'video' : 'image',
    url,
    thumbnailUrl: isVideo ? node.imageUrl : undefined,
    name: `画布引用 · ${title || (isVideo ? '视频节点' : '图片节点')}`,
  }];
}
