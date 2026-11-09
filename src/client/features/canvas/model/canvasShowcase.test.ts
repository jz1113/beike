import { describe, expect, it } from 'vitest';
import { buildShowcaseNodes, canvasVideoChoices } from './canvasShowcase';
import type { CanvasProject } from './types';

const project: CanvasProject = { id: 'project', title: '项目', createdAt: 1, updatedAt: 2, nodes: [
  { id: 'source', type: 'image', imageUrl: 'blob:image', title: '参考', x: 0, y: 0, width: 100, height: 100, createdAt: 1 },
  { id: 'output', type: 'drawing', videoUrl: '/storage/final.mp4', title: '成片', x: 200, y: 0, width: 100, height: 100, createdAt: 1,
    runs: [{ id: 'old', status: 'success', createdAt: 1, videoUrl: '/storage/old.mp4' }, { id: 'failed', status: 'error', createdAt: 2, videoUrl: '/storage/failed.mp4' }] },
], edges: [{ id: 'link', sourceNodeId: 'source', targetNodeId: 'output' }] };

describe('canvas showcase snapshot', () => {
  it('offers current and successful history videos without silently picking a version', () => {
    expect(canvasVideoChoices(project).map(choice => choice.key)).toEqual(['output:current', 'output:old']);
  });
  it('preserves connections and persists media without runtime task state', async () => {
    const snapshot = await buildShowcaseNodes(project, async url => url === 'blob:image' ? '/storage/image.png' : url);
    expect(snapshot[0].imageUrl).toBe('/storage/image.png');
    expect(snapshot[1].referenceNodeIds).toEqual(['source']);
    expect(snapshot[1]).not.toHaveProperty('runs');
  });
  it('does not publish an incomplete snapshot when a media copy fails', async () => {
    await expect(buildShowcaseNodes(project, async url => { if (url.startsWith('blob:')) throw new Error('素材不可用'); return url; })).rejects.toThrow('素材不可用');
  });
});
