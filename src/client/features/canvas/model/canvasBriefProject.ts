import type { CanvasProject } from './types';

/** A saved editable brief, without skill dispatch or automatic model execution. */
export function createCanvasBriefProject(brief: string, id: string, now: number, createdAt = now): CanvasProject {
  const text = brief.trim();
  if (!text) throw new Error('请先输入创作想法或脚本');
  return {
    id, title: text.split('\n')[0].slice(0, 40), nodes: [], draft: false, createdAt, updatedAt: now,
    studioScene: {
      nodes: [{ id: `${id}-brief`, type: 'text-node', nodeName: '创作想法', x: 80, y: 100, width: 420, height: 300, prompt: '', settings: { aiGenerated: true, text } }],
      connections: [], groups: [], strokes: [], textBoxes: [], view: { x: 40, y: 60, zoom: 0.8 },
    },
  };
}
