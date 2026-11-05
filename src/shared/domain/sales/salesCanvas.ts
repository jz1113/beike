export const salesCanvasStages = {
  'sales-collect': '商品采集与选图', 'sales-summary': '资料识别与卖点', 'sales-storyboard': '分镜与口播台词',
  'sales-voice': '口播音色与旁白配音', 'sales-video': '视频生成', 'sales-subtitles': '字幕编辑与导出', 'sales-export': '成片合成与导出',
} as const;
export type SalesCanvasStage = keyof typeof salesCanvasStages;
export interface SalesCanvasProjection {
  draft: unknown;
  stages: Record<SalesCanvasStage, { state: 'idle' | 'running' | 'success' | 'error'; summary: string }>;
  outputs: Array<{ id: string; title: string; mediaType: 'video' | 'audio' | 'text'; url?: string; text?: string }>;
}
export const salesCanvasLinks: Array<[SalesCanvasStage, SalesCanvasStage]> = [
  ['sales-collect', 'sales-summary'], ['sales-summary', 'sales-storyboard'], ['sales-storyboard', 'sales-voice'],
  ['sales-storyboard', 'sales-video'], ['sales-voice', 'sales-video'], ['sales-storyboard', 'sales-subtitles'],
  ['sales-video', 'sales-export'], ['sales-voice', 'sales-export'], ['sales-subtitles', 'sales-export'],
];
