import { apiRequest } from '@client/shared/api/apiRequest';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { requestModelId } from '@shared/domain/models/workflowModels';
import type { BatchProductItem, BatchTaskItem } from '../model/batchTypes';
import { PROMOTED_GROUP_HINT, type MotherReplacementState, type PromotedGroupCandidate } from '../model/generation/promoteGroup';

export type { MotherReplacementState, PromotedGroupCandidate } from '../model/generation/promoteGroup';

export async function loadMotherReplacement(motherId: string): Promise<MotherReplacementState> {
  const response = await apiRequest('GET', '/api/catalog/assets/mother-replacement', { search: `motherId=${encodeURIComponent(motherId)}` });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || '母组换图状态读取失败');
  return {
    replaced: Boolean(result.replaced), replaceable: Boolean(result.replaceable),
    replacedAt: typeof result.replacedAt === 'string' ? result.replacedAt : null,
    sourceImages: Array.isArray(result.sourceImages) ? result.sourceImages.filter((url: unknown): url is string => typeof url === 'string') : [],
  };
}

export async function analyzePromotedGroup(input: {
  item: BatchProductItem;
  groupIndex: number;
  tasks: BatchTaskItem[];
  visionModel: string;
}): Promise<PromotedGroupCandidate> {
  const { item, groupIndex, tasks, visionModel } = input;
  const response = await apiRequest('POST', '/api/catalog/assets/deconstruct', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrls: tasks.map((task) => task.resultUrl),
      albumName: `优选衍生图组 · ${item.title.slice(0, 40)} · ${groupIndex + 1}`,
      productTitle: item.title,
      targetCategory: item.category || undefined,
      userHint: PROMOTED_GROUP_HINT,
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
    const restored = await apiRequest('POST', '/api/catalog/assets/reviews', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: candidate.reviewId, action: 'restore' }),
    });
    if (!restored.ok) throw new Error((await restored.json().catch(() => ({}))).error || '恢复候选失败');
  }
  const response = await apiRequest('POST', '/api/catalog/assets/reviews', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: candidate.reviewId, action: 'approve' }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || '确认入库失败');
}

export async function replacePromotedGroup(candidate: PromotedGroupCandidate): Promise<void> {
  if (candidate.reviewStatus === 'rejected') {
    const restored = await apiRequest('POST', '/api/catalog/assets/reviews', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: candidate.reviewId, action: 'restore' }),
    });
    if (!restored.ok) throw new Error((await restored.json().catch(() => ({}))).error || '恢复候选失败');
  }
  const response = await apiRequest('POST', '/api/catalog/assets/reviews', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: candidate.reviewId, action: 'replace' }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || '母组换图失败');
}
