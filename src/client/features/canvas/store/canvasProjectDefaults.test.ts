import { describe, expect, it } from 'vitest';
import type { CanvasProject, StudioScene } from '../model/types';
import { studioCover, visibleCanvasProjects } from './canvasProjectDefaults';

const scene: StudioScene = { nodes: [], connections: [], groups: [], textBoxes: [], strokes: [], view: { x: 0, y: 0, zoom: 1 } };
const draft: CanvasProject = { id: 'draft', title: '未命名项目', nodes: [], createdAt: 0, updatedAt: 0, draft: true };

describe('画布项目库', () => {
  it('保留仅有笔迹或文本框的草稿，按最后修改时间排列', () => {
    const strokes = { ...draft, id: 'draw', updatedAt: 1, studioScene: { ...scene, strokes: [{}] } };
    const text = { ...draft, id: 'text', updatedAt: 2, studioScene: { ...scene, textBoxes: [{}] } };
    expect(visibleCanvasProjects([draft, strokes, text]).map(p => p.id)).toEqual(['text', 'draw']);
  });

  it('跳过临时地址及音视频正文，使用后续可恢复的图片', () => {
    const nodes = [
      { id: 'v', type: 'preview', previewType: 'video', content: '/storage/clip.mp4', settings: {generatedImages: [{fullUrl:'/storage/clip.mp4'}]} },
      { id: 'i', type: 'gen-image', generatedImages: [{fullUrl: 'blob:temporary'}, {fullUrl: '/storage/cover.png'}] },
    ];
    expect(studioCover({ ...scene, nodes })).toBe('/storage/cover.png');
  });
});
