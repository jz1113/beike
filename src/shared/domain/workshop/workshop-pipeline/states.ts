export const WORKSHOP_BATCH_STATUSES = [
  'draft',
  'collecting',
  'plan_ready',
  'analyzing',
  'review_required',
  'approved',
  'generating',
  'qc_required',
  'partial_failed',
  'paused',
  'completed',
  'cancelled',
  'archived',
] as const;

export type WorkshopBatchStatus = (typeof WORKSHOP_BATCH_STATUSES)[number];

/** Legacy contract value kept for parse-time normalization. */
export const LEGACY_BATCH_STATUSES = ['review'] as const;
export type LegacyWorkshopBatchStatus = (typeof LEGACY_BATCH_STATUSES)[number];

export const PRODUCT_PREPARATION_STATUSES = [
  'pending',
  'collecting',
  'ready',
  'needs_attention',
  'failed',
  'skipped',
] as const;

export type ProductPreparationStatus = (typeof PRODUCT_PREPARATION_STATUSES)[number];

export const STORYBOARD_REVIEW_STATUSES = [
  'not_started',
  'analyzing',
  'auto_passed',
  'needs_review',
  'approved',
  'rejected',
] as const;

export type StoryboardReviewStatus = (typeof STORYBOARD_REVIEW_STATUSES)[number];

export const OUTPUT_REVIEW_DECISIONS = [
  'unreviewed',
  'accepted',
  'retry_requested',
  'rejected',
] as const;

export type OutputReviewDecision = (typeof OUTPUT_REVIEW_DECISIONS)[number];

export const PIPELINE_RUN_STATUSES = [
  'queued',
  'running',
  'paused',
  'completed',
  'partial_failed',
  'failed',
  'cancelled',
] as const;

export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUSES)[number];

export const PIPELINE_RUN_KINDS = [
  'collection',
  'analysis',
  'generation',
  'copywriting',
  'export',
] as const;

export type PipelineRunKind = (typeof PIPELINE_RUN_KINDS)[number];

export const RESULT_REVISION_STATUSES = ['current', 'superseded'] as const;
export type ResultRevisionStatus = (typeof RESULT_REVISION_STATUSES)[number];

export const PAUSABLE_STATUSES: readonly WorkshopBatchStatus[] = [
  'collecting',
  'analyzing',
  'generating',
];

export const INCOMPLETE_STATUSES: readonly WorkshopBatchStatus[] = WORKSHOP_BATCH_STATUSES.filter(
  (status) => status !== 'completed' && status !== 'archived' && status !== 'cancelled',
);

export function isWorkshopBatchStatus(value: string | null | undefined): value is WorkshopBatchStatus {
  return Boolean(value && (WORKSHOP_BATCH_STATUSES as readonly string[]).includes(value));
}

export function normalizeBatchStatus(value: string | null | undefined): WorkshopBatchStatus {
  if (value === 'review') return 'review_required';
  if (isWorkshopBatchStatus(value)) return value;
  return 'draft';
}

export function isPausableStatus(status: WorkshopBatchStatus): boolean {
  return (PAUSABLE_STATUSES as readonly string[]).includes(status);
}

export function isIncompleteStatus(status: WorkshopBatchStatus): boolean {
  return (INCOMPLETE_STATUSES as readonly string[]).includes(status);
}

export function isTerminalBatchStatus(status: WorkshopBatchStatus): boolean {
  return status === 'completed' || status === 'archived' || status === 'cancelled';
}

const unknownDetail = /无法确认|无法辨认|无法判断|信息不足|不可见|未入(?:画|镜)|未见|看不清|不适用|无人物|无服装|未知/;
const garment = /衬衫|T恤|恤衫|上衣|卫衣|毛衣|针织衫|外套|开衫|夹克|西装|大衣|风衣|背心|吊带|连衣裙|半身裙|长裙|短裙|长裤|短裤|牛仔裤|套装|旗袍|礼服/;
const fragmentOnly = /局部|仅见|只见|只露|仅露|袖口|衣角|领口|衣袖/;
const placeholderText = /无法确认|无法辨认|无法判断|信息不足|未入(?:画|镜)|不可见|未见|不露脸|无人物|无人像|仅.*(?:手部|手指|手臂)/;

function isObservedDetail(value: unknown): boolean {
  const text = typeof value === 'string' ? value.trim() : '';
  return Boolean(text && !unknownDetail.test(text) && !/^(?:无|没有|不明|不详|none|null|unknown)$/i.test(text));
}

function hasReusableOutfitText(outfit: { top?: unknown; bottom?: unknown }): boolean {
  return [outfit.top, outfit.bottom].some(
    (value) => isObservedDetail(value) && garment.test(String(value)) && !fragmentOnly.test(String(value).trim()),
  );
}

function visualAssetIssue(asset: Record<string, unknown>, type: 'persona' | 'outfit'): string | null {
  const title = String(asset.title || asset.name || '').trim();
  if (type === 'outfit') {
    if (fragmentOnly.test(title) && !/套装|连衣裙/.test(title)) {
      return '仅有衣物局部，不能作为可复用穿搭；请重新拆解或修正分类';
    }
    if ((asset.top || asset.bottom) && !hasReusableOutfitText(asset)) {
      return '未识别到清晰的服装款式，请核对原图后修正';
    }
  }
  if (type === 'persona' && /无人物|无人像|仅.*(?:手部|手指|手臂)|不露脸/.test(title)) {
    return '没有可辨识的人物面部，不能作为人物资产';
  }
  return null;
}

export function isPlaceholderIdentity(asset: object, type: 'persona' | 'outfit'): boolean {
  const record = asset as Record<string, unknown>;
  if (visualAssetIssue(record, type)) return true;
  if (type === 'persona') {
    const hasCore = [record.face, record.hair].some((v) => typeof v === 'string' && v.trim() && !placeholderText.test(v));
    if (!hasCore && [record.face, record.hair, record.description].some((v) => placeholderText.test(String(v || '')))) return true;
    return placeholderText.test(String(record.name || ''));
  }
  return [record.title, record.top, record.bottom].some((v) => placeholderText.test(String(v || '')));
}
