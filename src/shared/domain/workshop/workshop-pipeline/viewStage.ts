import { normalizeBatchStatus, type WorkshopBatchStatus } from './states';

export type WorkshopViewStage = 1 | 2 | 3 | 4;

const STATUS_TO_STAGE: Record<WorkshopBatchStatus, WorkshopViewStage> = {
  draft: 1,
  collecting: 1,
  plan_ready: 2,
  analyzing: 3,
  review_required: 3,
  approved: 3,
  generating: 4,
  qc_required: 4,
  partial_failed: 4,
  paused: 4,
  completed: 4,
  cancelled: 4,
  archived: 4,
};

export interface LegacySnapshotHints {
  currentStage: number;
  itemCount: number;
  analyzing?: boolean;
  hasStoryboard?: boolean;
  generating?: boolean;
  hasFailedTasks?: boolean;
  allTasksSucceeded?: boolean;
  archived?: boolean;
}

export function statusToViewStage(status: WorkshopBatchStatus | string): WorkshopViewStage {
  return STATUS_TO_STAGE[normalizeBatchStatus(status)];
}

/**
 * Map a v1 snapshot (page stage + loose flags) onto the new business status.
 * Historical batches must never be auto-promoted to completed.
 */
export function legacyStageToStatus(hints: LegacySnapshotHints): WorkshopBatchStatus {
  if (hints.archived) return 'archived';
  if (hints.itemCount <= 0) return 'draft';

  const stage = Math.min(4, Math.max(1, Math.trunc(hints.currentStage) || 1));
  if (stage === 1) return 'collecting';
  if (stage === 2) return 'plan_ready';
  if (stage === 3) {
    if (hints.analyzing) return 'analyzing';
    if (hints.hasStoryboard) return 'review_required';
    return 'analyzing';
  }

  if (hints.generating) return 'generating';
  if (hints.hasFailedTasks) return 'partial_failed';
  if (hints.allTasksSucceeded) return 'qc_required';
  return 'generating';
}
