import { useEffect } from 'react';
import { useAppStore } from '@client/store';
import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { publishCanvasResult, publishMediaResult, readHomeSync, type HomeCanvasNode } from '@client/shared/homePublish/homePublish';

type CompletionDetail = {
  id?: string;
  updates?: { status?: string; resultUrl?: string | null };
};

function snapshotNode(node: {
  id: string;
  type: string;
  title?: string;
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  referenceNodeIds?: string[];
}): HomeCanvasNode {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    content: node.content?.slice(0, 500),
    imageUrl: node.imageUrl,
    videoUrl: node.videoUrl,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    referenceNodeIds: node.referenceNodeIds,
  };
}

export function HomePublishSync() {
  useEffect(() => {
    const onCompleted = (event: Event) => {
      if (!readHomeSync() || !(event instanceof CustomEvent)) return;
      const detail = event.detail as CompletionDetail | undefined;
      const updates = detail?.updates;
      if (updates?.status !== 'SUCCESS' || !updates.resultUrl || !detail?.id) return;
      const taskId = detail.id;
      const resultUrl = updates.resultUrl;
      const project = useCanvasStore.getState().projects.find(item => item.nodes.some(node => node.taskId === taskId || node.id === taskId));
      if (project) {
        const nodes = project.nodes.map(node => {
          if (node.taskId !== taskId && node.id !== taskId) return snapshotNode(node);
          const video = node.type === 'video' || node.generationKind === 'video' || isVideoMediaUrl(resultUrl);
          return snapshotNode({ ...node, imageUrl: video ? node.imageUrl : resultUrl, videoUrl: video ? resultUrl : node.videoUrl });
        });
        const cover = [...nodes].reverse().find(node => node.videoUrl || node.imageUrl);
        const coverUrl = cover?.videoUrl || cover?.imageUrl || resultUrl;
        const synopsis = nodes.find(node => (node.type === 'prompt' || node.type === 'note') && node.content?.trim())?.content?.trim()
          || nodes.find(node => node.title?.trim())?.title?.trim()
          || project.title;
        publishCanvasResult({
          projectId: project.id,
          title: project.title,
          synopsis: synopsis || '',
          nodes,
          coverUrl,
          video: Boolean(cover?.videoUrl) || isVideoMediaUrl(coverUrl),
        });
        return;
      }
      const store = useAppStore.getState();
      const task = store.generationTasks.find(item => item.id === taskId || item.taskId === taskId)
        || store.sessions.flatMap(session => session.tasks).find(item => item.id === taskId || item.taskId === taskId);
      publishMediaResult({ id: taskId, prompt: task?.prompt || '', url: resultUrl, mediaType: task?.mediaType });
    };
    window.addEventListener('azhuo:generation-completed', onCompleted);
    return () => window.removeEventListener('azhuo:generation-completed', onCompleted);
  }, []);
  return null;
}
