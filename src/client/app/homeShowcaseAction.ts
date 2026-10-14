import { useAppStore } from '@client/store';
import { useCanvasStore } from '@client/features/canvas/store/useCanvasStore';
import { isMediaPublishedOnHome, publishMediaResult, unpublishMediaFromHome } from '@client/shared/home-publish/homePublish';
import { cleanOriginalMediaUrl } from './context-menu/contextMenuMedia';

function showcaseId(url: string) {
  let hash = 0;
  for (const char of url) hash = Math.imul(hash, 31) + char.charCodeAt(0) | 0;
  return `url-${(hash >>> 0).toString(36)}`;
}

export function toggleHomeShowcase(rawUrl: string, kind: 'image' | 'video'): 'published' | 'removed' {
  const url = cleanOriginalMediaUrl(rawUrl);
  if (isMediaPublishedOnHome(url)) {
    unpublishMediaFromHome(url);
    return 'removed';
  }
  const store = useAppStore.getState();
  const task = [...store.generationTasks, ...store.sessions.flatMap(session => session.tasks)]
    .find(item => item.resultUrl && cleanOriginalMediaUrl(item.resultUrl) === url);
  if (task) {
    publishMediaResult({ id: task.id || task.taskId || showcaseId(url), prompt: task.prompt || '', title: task.title, url, mediaType: kind });
    return 'published';
  }
  for (const project of useCanvasStore.getState().projects) {
    const node = project.nodes.find(item =>
      (item.imageUrl && cleanOriginalMediaUrl(item.imageUrl) === url) || (item.videoUrl && cleanOriginalMediaUrl(item.videoUrl) === url));
    if (!node) continue;
    publishMediaResult({ id: `canvas-${node.id}`, prompt: node.content || '', title: node.title || project.title, url, mediaType: kind });
    return 'published';
  }
  publishMediaResult({ id: showcaseId(url), prompt: '', url, mediaType: kind });
  return 'published';
}
