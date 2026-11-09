import type { HomeCanvasNode } from '@client/shared/home-publish/homePublish';
import type { CanvasProject } from './types';

export interface CanvasVideoChoice { key: string; nodeId: string; url: string; label: string; aspectRatio?: string }

/** Show the current video and successful saved versions; never guess the final cut. */
export function canvasVideoChoices(project: CanvasProject): CanvasVideoChoice[] {
  return project.nodes.flatMap(node => {
    const seen = new Set<string>();
    const choices: CanvasVideoChoice[] = [];
    const add = (key: string, url: string | undefined, label: string) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      choices.push({ key: `${node.id}:${key}`, nodeId: node.id, url, label: `${node.title || '视频节点'} · ${label}`, aspectRatio: node.aspectRatio || node.drawing?.aspect });
    };
    if (node.status !== 'generating' && node.status !== 'error') add('current', node.videoUrl, '当前画面');
    for (const run of [...(node.runs || [])].reverse()) {
      if (run.status === 'success') add(run.id, run.videoUrl, `历史版本 ${new Date(run.createdAt).toLocaleString('zh-CN')}`);
    }
    return choices;
  });
}

/** Preserve the visible graph and its incoming connections, without task credentials or runtime state. */
export async function buildShowcaseNodes(project: CanvasProject, persistMedia: (url: string) => Promise<string>): Promise<HomeCanvasNode[]> {
  const ids = new Set(project.nodes.map(node => node.id));
  return Promise.all(project.nodes.map(async node => {
    if (![node.x, node.y, node.width, node.height].every(Number.isFinite) || node.width <= 0 || node.height <= 0) {
      throw new Error(`节点「${node.title || node.id}」的位置或尺寸无效，请先检查画布`);
    }
    const references = [...new Set([...(node.referenceNodeIds || []), ...(project.edges || []).filter(edge => edge.targetNodeId === node.id).map(edge => edge.sourceNodeId)])].filter(id => ids.has(id));
    const content = node.content || node.textPrompt;
    return {
      id: node.id, type: node.type, title: node.title, content: content && !/^(?:blob:|data:|local-asset:\/\/|\/storage\/)/i.test(content) ? content : undefined,
      imageUrl: node.imageUrl ? await persistMedia(node.imageUrl) : undefined,
      videoUrl: node.videoUrl ? await persistMedia(node.videoUrl) : undefined,
      x: node.x, y: node.y, width: node.width, height: node.height,
      referenceNodeIds: references,
    };
  }));
}
