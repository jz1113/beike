import type { CanvasNode, CanvasProductionDraft, CanvasShotDraft } from './types';
export const assetRoleLabels = { product: '商品主体', person: '人物 / 手部', scene: '场景参考', reference: '参考资料', clip: '可直接使用的视频', audio: '配音 / 音乐' } as const;
export function newShot(): CanvasShotDraft {
  return { id: crypto.randomUUID(), title: '', seconds: 2, imagePrompt: '', videoPrompt: '' };
}
/** Local parsing only. Unsupported prose stays in the source field for manual review. */
export function parseProductionText(text: string): CanvasShotDraft[] {
  const shots: CanvasShotDraft[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*]\s+|#{1,6}\s*)/, '').trim();
    const cells = line.replace(/^\||\|$/g, '').split('|').map(s => s.trim());
    if (cells.length >= 4 && /^\d+(?:\.\d+)?(?:\s*秒|s)?$/i.test(cells[1])) {
      shots.push({ ...newShot(), title: cells[0], seconds: parseFloat(cells[1]), imagePrompt: cells[2], videoPrompt: cells.slice(3).join(' | ') });
      continue;
    }
    const timed = /^(\d+(?:\.\d+)?)\s*(?:秒|s)?\s*[-–—~至]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)\s*[:：]\s*(.+)$/i.exec(line);
    if (timed && Number(timed[2]) > Number(timed[1])) {
      shots.push({ ...newShot(), title: timed[3], seconds: Number(timed[2]) - Number(timed[1]), imagePrompt: timed[3], videoPrompt: '' });
    }
  }
  if (shots.length > 40) throw new Error('单次最多导入 40 个分镜，请拆分制作方案');
  return shots;
}
export interface ProductionModels { image: string; video: string; videoDurations: number[]; videoQuality: string; videoAspect: string }
export function buildProductionNodes(draft: CanvasProductionDraft, nodes: CanvasNode[], models: ProductionModels): CanvasNode[] {
  const pending = draft.shots.filter(shot => !nodes.some(node => node.productionShotId === shot.id));
  if (!pending.length) throw new Error('没有待创建的分镜');
  const images = nodes.filter(node => node.type !== 'video' && node.generationKind !== 'video' && node.imageUrl && !node.missingMedia && node.status !== 'generating');
  const shared = images.filter(node => node.assetRole === 'product' || node.assetRole === 'person' || node.assetRole === 'scene');
  const result: CanvasNode[] = [];
  const top = nodes.length ? Math.max(...nodes.map(node => node.y + node.height)) + 100 : 120;
  pending.forEach((shot, index) => {
    if (!shot.title.trim() || !Number.isFinite(shot.seconds) || shot.seconds <= 0 || shot.seconds > 120) throw new Error(`分镜 ${index + 1} 需要标题及 0–120 秒范围内的有效时长`);
    const clip = shot.videoNodeId ? nodes.find(node => node.id === shot.videoNodeId && node.videoUrl && !node.missingMedia && node.status !== 'generating') : undefined;
    if (shot.videoNodeId && !clip) throw new Error(`${shot.title}：已选视频不存在或尚未就绪`);
    const image = shot.imageNodeId ? images.find(node => node.id === shot.imageNodeId) : undefined;
    if (!clip && shot.imageNodeId && !image) throw new Error(`${shot.title}：已选关键帧不存在或尚未就绪`);
    if (!clip && !image && !shot.imagePrompt.trim()) throw new Error(`${shot.title}：请填写图片提示词或选择已有关键帧`);
    if (!clip && !shot.videoPrompt.trim()) throw new Error(`${shot.title}：请填写视频动作或选择已有视频`);
    const y = top + index * 740;
    const common = { createdAt: Date.now(), productionShotId: shot.id, editDuration: shot.seconds };
    result.push({ ...common, id: crypto.randomUUID(), type: 'note', title: shot.title, content: `${draft.shots.indexOf(shot) + 1}. ${shot.title}\n成片使用 ${shot.seconds} 秒\n${clip ? '复用已有视频，无需生成' : '先检查关键帧，再生成视频；生成时长与剪辑时长分别设置'}`, x: 80, y, width: 280, height: 180 });
    if (clip) {
      result.push({ ...common, id: crypto.randomUUID(), type: 'video', title: shot.title, videoUrl: clip.videoUrl, imageUrl: clip.imageUrl, status: 'success', assetRole: 'clip', x: 460, y, width: 300, height: 480 });
      return;
    }
    const duration = [...models.videoDurations].sort((a,b) => a-b).find(seconds => seconds >= shot.seconds);
    if (!duration) throw new Error(`${shot.title}：成片时长超过当前模型单段生成时长，请拆分镜头或更换视频模型`);
    const frameId = image?.id || crypto.randomUUID();
    if (!image) result.push({ ...common, id: frameId, type: 'drawing', generationKind: 'image', title: `${shot.title} · 关键帧`, content: shot.imagePrompt, status: 'idle', referenceNodeIds: shared.map(node => node.id),
      drawing: { model: models.image, quality: 'medium', aspect: draft.aspect, count: 1, references: [] }, x: 460, y, width: 300, height: 480 });
    result.push({ ...common, id: crypto.randomUUID(), type: 'drawing', generationKind: 'video', title: `${shot.title} · 视频`, content: shot.videoPrompt, status: 'idle', referenceNodeIds: [frameId],
      drawing: { model: models.video, quality: models.videoQuality, aspect: models.videoAspect, count: 1, duration, refMode: 'first_last_frame', references: [] }, x: image ? 460 : 870, y, width: 300, height: 480 });
  });
  return result;
}
