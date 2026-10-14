import { initialRegistryStatus, type PromptAssetType } from '../../prompts/prompt-asset/states';
import { visualAssetIssue } from '../../assets/asset-deconstruct/visualEvidence';
import { isCompletePromptGroup, type PromptGroupCandidate } from './groupAssetSelection';

export interface WorkshopAssetCandidate extends PromptGroupCandidate {
  name?: string | null;
  description?: string | null;
  reversePrompt?: string | null;
  provenance?: string | null;
  registry?: { status?: string } | null;
  contentEligible?: boolean;
}

// Judge the asset's identity, not every incidental detail. An unknown lower body
// does not invalidate a clearly described visible sleeve or upper-body outfit.
const placeholderIdentity = /^(?:不适用|无法确认|信息不足|未知|未识别|无人物|无人物穿搭|无人(?:像|物|出镜)?(?:穿搭)?|无模特|纯商品|纯静物|无穿搭|无服装)(?:[（(：:，,。\s].*)?$/;
export function isPlaceholderIdentity(asset: object, type: PromptAssetType): boolean {
  if (type !== 'persona' && type !== 'outfit') return false;
  const row = asset as WorkshopAssetCandidate;
  if (typeof row.contentEligible === 'boolean') return !row.contentEligible;
  const identity = String(row.name || row.title || '').trim();
  if (identity) return placeholderIdentity.test(identity);
  const description = String(row.description || row.reversePrompt || '').trim();
  return !description || placeholderIdentity.test(description);
}

/** One production policy for full rows, slim options, and server-side recall. */
export function workshopAssetBlockReason(asset: WorkshopAssetCandidate, type: PromptAssetType): string | null {
  if (isPlaceholderIdentity(asset, type)) return '占位记录，不是可用的人物或穿搭资产';
  const visualIssue = visualAssetIssue(asset as unknown as Record<string, unknown>, type);
  if (visualIssue) return visualIssue;
  if (asset.provenance === 'reference_import' || asset.provenance === 'legacy_single') return '参考素材尚未转为生产资产';
  // Mirrors the existing registry grandfather policy without writing during GET.
  const status = asset.registry?.status ?? initialRegistryStatus(asset.provenance, true);
  if (status !== 'published') return '资产尚未发布或已停用';
  if (type === 'full_prompt' && !isCompletePromptGroup(asset)) return '母本缺少完整的四图分镜';
  return null;
}

export function isWorkshopAssetEligible(asset: WorkshopAssetCandidate, type: PromptAssetType): boolean {
  return workshopAssetBlockReason(asset, type) === null;
}
