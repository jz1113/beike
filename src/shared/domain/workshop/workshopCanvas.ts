export const workshopCanvasStages = {
  collect: '商品采集', images: '商品选图与设置', storyboard: '图文分镜',
  generate: '批量图片生成', copy: '发布文案', export: '导出交付',
} as const;
export type WorkshopCanvasStage = keyof typeof workshopCanvasStages;
export interface WorkshopCanvasProjection {
  batchId: string;
  stages: Record<WorkshopCanvasStage, { state: 'idle' | 'running' | 'success' | 'error'; summary: string }>;
  outputs: Array<{ id: string; title: string; url?: string; text?: string }>;
}
export const workshopCanvasLinks: Array<[WorkshopCanvasStage, WorkshopCanvasStage]> = [
  ['collect', 'images'], ['images', 'storyboard'], ['storyboard', 'generate'],
  ['storyboard', 'copy'], ['generate', 'export'], ['copy', 'export'],
];
