import type { CanvasProject, StudioScene } from './types';
import { w3CopyAnalysisPrompt, w3CopyKeyframePrompt, w3CopyVideoPrompt } from './videoWorkflowPrompts';

export function createW3CopyProject(id: string, now: number): CanvasProject {
  const nodes: StudioScene['nodes'] = [];
  const connections: StudioScene['connections'] = [];
  const node = (key: string, type: string, nodeName: string, x: number, y: number, settings: Record<string, unknown> = {}, prompt = '') =>
    nodes.push({ id: `${id}-${key}`, type, nodeName, x, y, width: 340, height: 300, settings, prompt });
  const link = (from: string, to: string) => connections.push({ id: `${id}-${from}-${to}`, from: `${id}-${from}`, to: `${id}-${to}` });
  node('source', 'input-image', '01 上传参考视频', 80, 120, { mediaType: 'video' });
  node('product', 'input-image', '02 上传商品 / 服装参考图', 80, 510, { mediaType: 'image' });
  node('person', 'input-image', '03 上传目标人物图', 80, 900, { mediaType: 'image' });
  node('background', 'input-image', '04 上传场景 / 背景图', 80, 1290, { mediaType: 'image' });
  node('brief', 'text-node', '创作要求 · 15秒静音', 500, 650, {
    text: '成片为一条15秒竖屏视频，全程静音。人物、商品和背景以当前参考图为准，保持动作自然，不加速塞入整段原片。', aiGenerated: true,
  });
  node('analysis', 'text-node', '05 分析原片与改编分镜', 500, 120, {
    textNodeDraftPrompt: w3CopyAnalysisPrompt, textNodeComposerPromptExpanded: true, beikeTextResultRequired: true, beikeTextImageCount: 3,
  }, w3CopyAnalysisPrompt);
  node('keyframe', 'gen-image', '06 制作目标人物与商品主图', 920, 650, { ratio: '9:16', batchCount: 1, beikeStoryboardKeyframe: true }, w3CopyKeyframePrompt);
  node('video', 'gen-video', '08 生成15秒静音视频 · 秘塔H3 / 768P', 1340, 350, {
    model: 'MiniMax-H3', ratio: 'adaptive', resolution: '768P', duration: '15s', beikeAnalysisHandoffVersion: 1,
    beikeVideoWorkflow: 'w3-copy', beikeVideoMode: 'first_frame', beikeVideoAudio: false, beikeOptimizePrompt: false,
  }, w3CopyVideoPrompt);
  node('preview', 'preview', '10 预览成片', 1760, 120);
  node('save', 'local-save', '12 保存生成结果', 2180, 120);
  link('source', 'analysis');
  for (const source of ['product', 'person', 'background']) {
    link(source, 'analysis');
    link(source, 'keyframe');
  }
  link('brief', 'analysis');
  link('brief', 'keyframe');
  link('analysis', 'keyframe');
  link('analysis', 'video');
  link('keyframe', 'video');
  link('video', 'preview');
  link('video', 'save');
  return { id, title: 'W3复刻模板', createdAt: now, updatedAt: now, draft: false, nodes: [], edges: [],
    studioScene: { nodes, connections, groups: [], textBoxes: [], strokes: [], view: { x: 40, y: 60, zoom: 0.55 } } };
}
