import { describe, expect, it, vi } from 'vitest';
import { buildCanvasAssets } from './canvasAssets';
import { mergeAssetTasks } from './mergeAssetTasks';
import { buildMaterialProjects, taskBelongsToProject } from './materialProjects';
import type { AssetCanvasProject } from './canvasAssets';

vi.mock('@client/store/persist/generation', () => ({ isGenerationDeleted: () => false }));

const canvas: AssetCanvasProject = { id: 'canvas-1', title: '画布', createdAt: 1, updatedAt: 2, nodes: [
  { id: 'image', type: 'image', imageUrl: '/image.png' },
  { id: 'video', type: 'video', videoUrl: '/video.mp4', imageUrl: '/video-cover.png' },
  { id: 'note', type: 'text', content: '备注不计入素材' },
] };
function merged(canvases = [canvas]) {
  return mergeAssetTasks({ dbTasks: [], generationTasks: [], sessions: [], canvasTasks: buildCanvasAssets(canvases).canvasTasks, mediaCategory: 'all', searchKeyword: '', timeFilter: 'all' });
}

describe('material projects and canvas assets', () => {
  it('includes canvas media in all mode, retaining the video URL and cover separately', () => {
    const tasks = merged();
    expect(tasks).toHaveLength(2);
    expect(tasks.find((task) => task.nodeId === 'video')).toMatchObject({ canvasProjectId: canvas.id, resultUrl: '/video.mp4', coverUrl: '/video-cover.png' });
  });

  it('counts the same media shown in details and uses image covers for folder previews', () => {
    const tasks = merged();
    const [project] = buildMaterialProjects([], [canvas], tasks);
    expect(project.assetCount).toBe(2);
    expect(tasks.filter((task) => taskBelongsToProject(task, project))).toHaveLength(project.assetCount);
    expect(project.photos).toEqual(['/image.png', '/video-cover.png']);
  });

  it('keeps empty projects navigable without exposing their cover as a deletable media item', () => {
    const empty = { ...canvas, nodes: [], thumbnail: '/project-cover.png' };
    expect(merged([empty])).toEqual([]);
    expect(buildMaterialProjects([], [empty], merged([empty]))[0]).toMatchObject({ id: empty.id, assetCount: 0 });
  });

  it('matches exact ownership without treating a substring in another batch as membership', () => {
    const project = { id: 'session-1', type: 'session' as const };
    expect(taskBelongsToProject({ id: 'yes', sessionId: project.id }, project)).toBe(true);
    expect(taskBelongsToProject({ id: 'no', sessionId: 'session-10', batchId: 'session-10' }, project)).toBe(false);
    expect(taskBelongsToProject({ id: 'no', batchId: 'prefix-session-1-suffix' }, project)).toBe(false);
    expect(taskBelongsToProject({ id: 'canvas', canvasProjectId: project.id, sessionId: project.id }, project)).toBe(false);
  });

  it('supports an exact legacy canvas batch and prioritizes explicit canvas identity', () => {
    const project = { id: canvas.id, type: 'canvas' as const };
    expect(taskBelongsToProject({ id: 'yes', batchId: `canvas-project-${canvas.id}` }, project)).toBe(true);
    expect(taskBelongsToProject({ id: 'no', batchId: `canvas-project-${canvas.id}0` }, project)).toBe(false);
    expect(taskBelongsToProject({ id: 'no', canvasProjectId: 'other', batchId: `canvas-project-${canvas.id}` }, project)).toBe(false);
  });

  it('keeps legacy canvas membership consistent between counts and details when session metadata also exists', () => {
    const session = { id: 's', title: '对话', createdAt: 1, tasks: [] };
    const task = { id: 'legacy', sessionId: 's', batchId: `canvas-project-${canvas.id}` };
    for (const project of buildMaterialProjects([session], [canvas], [task])) {
      expect([task].filter((item) => taskBelongsToProject(item, project))).toHaveLength(project.assetCount);
    }
  });

  it('does not use audio, documents or failed media as folder images', () => {
    const session = { id: 's', title: '', createdAt: 1, tasks: [] };
    const tasks = [
      { id: 'audio', sessionId: 's', resultUrl: '/audio.mp3', mediaType: 'audio' },
      { id: 'doc', sessionId: 's', resultUrl: '/doc.pdf', mediaType: 'doc' },
      { id: 'failed', sessionId: 's', resultUrl: '/failed.png', status: 'FAILURE' },
    ];
    expect(buildMaterialProjects([session], [], tasks)[0]).toMatchObject({ title: '新创作对话', assetCount: 3, photos: [] });
  });
});
