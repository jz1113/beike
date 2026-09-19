import { expect, it } from 'vitest';
import { buildProductionNodes, newShot, parseProductionText } from '../canvasProduction';
import type { CanvasNode, CanvasProductionDraft } from '../types';
const models = { image: 'image-model', video: 'video-model', videoDurations: [5, 10], videoQuality: '720P', videoAspect: '9:16' };
const source: CanvasNode = { id: 'product', type: 'image', assetRole: 'product', imageUrl: '/storage/product.png', x: 0, y: 0, width: 300, height: 400, createdAt: 1 };
const plan = (): CanvasProductionDraft => ({ source: '', aspect: '9:16', shots: [{ ...newShot(), title: '开盒', seconds: 2, imagePrompt: '商品近景', videoPrompt: '缓慢打开盒盖' }] });
it('parses reviewed pipe rows and time ranges without turning arbitrary prose into tasks', () => {
  const result = parseProductionText('标题 | 秒数 | 图片 | 视频\n开盒 | 2秒 | 白桌面 | 慢慢打开\n4–6秒：切面特写\n这是一段补充说明');
  expect(result.map(s => [s.title,s.seconds,s.videoPrompt])).toEqual([['开盒',2,'慢慢打开'],['切面特写',2,'']]);
});
it('links product → new keyframe → video and keeps edit duration separate', () => {
  const nodes = buildProductionNodes(plan(), [source], models);
  const image = nodes.find(n => n.generationKind === 'image')!;
  const video = nodes.find(n => n.generationKind === 'video')!;
  expect(image.referenceNodeIds).toEqual(['product']);
  expect(video.referenceNodeIds).toEqual([image.id]);
  expect(video).toMatchObject({ editDuration: 2, status: 'idle', drawing: { duration: 5, refMode: 'first_last_frame', aspect: '9:16' } });
});
it('reuses an existing keyframe and creates no new image generation', () => {
  const draft = plan(); draft.shots[0].imageNodeId = source.id; draft.shots[0].imagePrompt = '';
  const nodes = buildProductionNodes(draft, [source], models);
  expect(nodes.some(n => n.generationKind === 'image')).toBe(false);
  expect(nodes.find(n => n.generationKind === 'video')?.referenceNodeIds).toEqual([source.id]);
});
it('reuses a video without creating any model tasks or requiring prompts', () => {
  const draft = plan(); draft.shots[0] = { ...draft.shots[0], imagePrompt: '', videoPrompt: '', videoNodeId: 'clip' };
  const nodes = buildProductionNodes(draft, [{ ...source, id: 'clip', type: 'video', imageUrl: undefined, videoUrl: '/storage/clip.mp4' }], models);
  expect(nodes.some(n => n.type === 'drawing')).toBe(false);
  expect(nodes.find(n => n.type === 'video')).toMatchObject({ videoUrl: '/storage/clip.mp4', editDuration: 2 });
});
it('rejects missing media, missing motion, unsupported lengths and duplicate creation', () => {
  const draft = plan(); draft.shots[0].videoNodeId = 'missing';
  expect(() => buildProductionNodes(draft, [], models)).toThrow('不存在');
  draft.shots[0].videoNodeId = ''; draft.shots[0].videoPrompt = '';
  expect(() => buildProductionNodes(draft, [], models)).toThrow('视频动作');
  draft.shots[0].videoPrompt = '推近'; draft.shots[0].seconds = 11;
  expect(() => buildProductionNodes(draft, [], models)).toThrow('拆分镜头');
  draft.shots[0].seconds = 2;
  const nodes = buildProductionNodes(draft, [], models);
  expect(() => buildProductionNodes(draft, nodes, models)).toThrow('没有待创建');
});
it('does not pass unrelated audio, clips or reference documents as image inputs', () => {
  const nodes = buildProductionNodes(plan(), [source, { ...source, id: 'ref', assetRole: 'reference' }, { ...source, id: 'video', generationKind: 'video', assetRole: 'product' }], models);
  expect(nodes.find(n => n.generationKind === 'image')?.referenceNodeIds).toEqual(['product']);
});
