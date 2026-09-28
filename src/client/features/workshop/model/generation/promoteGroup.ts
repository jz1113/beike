import { apiFetch } from '@client/shared/api/apiClient';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { requestModelId } from '@shared/domain/models/workflowModels';
import type { BatchProductItem, BatchTaskItem } from '../batchTypes';

export interface PromotedGroupCandidate {
  reviewId: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  data: Record<string, unknown>;
  previewShots: Array<{ title?: string; reverse_prompt_zh?: string; reverse_prompt?: string }>;
}

export async function analyzePromotedGroup(input: {
  item: BatchProductItem;
  groupIndex: number;
  tasks: BatchTaskItem[];
  visionModel: string;
}): Promise<PromotedGroupCandidate> {
  const { item, groupIndex, tasks, visionModel } = input;
  const response = await apiFetch('/api/catalog/assets/deconstruct', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrls: tasks.map((task) => task.resultUrl),
      albumName: `优选衍生图组 · ${item.title.slice(0, 40)} · ${groupIndex + 1}`,
      productTitle: item.title,
      targetCategory: item.category || undefined,
      userHint: '这四张是同一款商品的满意成图。逐图忠实分析实际画面；在图组架构总结中提炼可复用的机位、动作、空间和光影关系。商品品牌、型号、颜色、文字与外观属于本次商品，复用时必须以新商品参考图替换。',
      clientTaskId: `promote_${item.id.slice(0, 32)}_${groupIndex}_${tasks.map((task) => task.id.slice(-16)).join('_')}`.slice(0, 160),
      model: requestModelId(visionModel),
      ...getMultimodalClientOverrides(visionModel),
      autoSave: false, reviewBeforeSave: true, fullPromptOnly: true,
      parentFullPromptId: item.appliedFullPromptId || null,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success || !result.reviewId) {
    throw new Error(result.error || `图组提炼失败 (HTTP ${response.status})`);
  }
  return {
    reviewId: result.reviewId,
    reviewStatus: result.reviewStatus || 'pending',
    data: result.data || {},
    previewShots: Array.isArray(result.previewShots) ? result.previewShots : [],
  };
}

export async function approvePromotedGroup(candidate: PromotedGroupCandidate): Promise<void> {
  if (candidate.reviewStatus === 'rejected') {
    const restored = await apiFetch('/api/catalog/assets/reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: candidate.reviewId, action: 'restore' }),
    });
    if (!restored.ok) throw new Error((await restored.json().catch(() => ({}))).error || '恢复候选失败');
  }
  const response = await apiFetch('/api/catalog/assets/reviews', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: candidate.reviewId, action: 'approve' }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || '确认入库失败');
}
