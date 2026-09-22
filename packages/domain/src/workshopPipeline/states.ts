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
