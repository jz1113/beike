import type { WorkshopBatchEvent } from './events';
import {
  isIncompleteStatus,
  isPausableStatus,
  type WorkshopBatchStatus,
} from './states';

export interface ReduceContext {
  pausedFrom?: WorkshopBatchStatus;
}

export type ReduceResult =
  | { ok: true; next: WorkshopBatchStatus; pausedFrom?: WorkshopBatchStatus }
  | { ok: false; reason: string };

const ALLOWED: Record<WorkshopBatchEvent['type'], WorkshopBatchStatus[]> = {
  START_COLLECTION: ['draft', 'plan_ready'],
  COLLECTION_FINISHED: ['collecting'],
  CONFIRM_PLAN: ['collecting', 'plan_ready'],
  START_ANALYSIS: ['plan_ready', 'review_required', 'approved', 'partial_failed'],
  ANALYSIS_FINISHED: ['analyzing'],
  APPROVE_STORYBOARD: ['review_required', 'approved'],
  START_GENERATION: ['approved', 'qc_required', 'partial_failed'],
  GENERATION_FINISHED: ['generating'],
  SUBMIT_OUTPUT_REVIEW: ['generating', 'qc_required', 'partial_failed'],
  COMPLETE_BATCH: ['qc_required'],
  PAUSE_RUN: ['collecting', 'analyzing', 'generating'],
  RESUME_RUN: ['paused'],
  CANCEL_BATCH: [],
  ARCHIVE_BATCH: ['completed', 'cancelled'],
};

function fail(reason: string): ReduceResult {
  return { ok: false, reason };
}

function ok(next: WorkshopBatchStatus, pausedFrom?: WorkshopBatchStatus): ReduceResult {
  return pausedFrom ? { ok: true, next, pausedFrom } : { ok: true, next };
}

export function reduceBatch(
  status: WorkshopBatchStatus,
  event: WorkshopBatchEvent,
  context: ReduceContext = {},
): ReduceResult {
  if (event.type === 'CANCEL_BATCH') {
    if (!isIncompleteStatus(status)) {
      return fail(`状态 ${status} 不允许取消`);
    }
    return ok('cancelled');
  }

  const allowed = ALLOWED[event.type];
  if (allowed.length > 0 && !allowed.includes(status)) {
    return fail(`状态 ${status} 不允许事件 ${event.type}`);
  }

  switch (event.type) {
    case 'START_COLLECTION':
      return ok('collecting');
    case 'COLLECTION_FINISHED':
    case 'CONFIRM_PLAN':
      return ok('plan_ready');
    case 'START_ANALYSIS':
      return ok('analyzing');
    case 'ANALYSIS_FINISHED':
      return ok(event.result === 'partial_failed' ? 'partial_failed' : 'review_required');
    case 'APPROVE_STORYBOARD':
      return ok('approved');
    case 'START_GENERATION':
      return ok('generating');
    case 'GENERATION_FINISHED':
      return ok(event.result === 'partial_failed' ? 'partial_failed' : 'qc_required');
    case 'SUBMIT_OUTPUT_REVIEW':
      return ok('qc_required');
    case 'COMPLETE_BATCH':
      return ok('completed');
    case 'PAUSE_RUN':
      if (!isPausableStatus(status)) {
        return fail(`状态 ${status} 不允许暂停`);
      }
      return ok('paused', status);
    case 'RESUME_RUN': {
      const resumed = context.pausedFrom;
      if (!resumed || !isPausableStatus(resumed)) {
        return fail('暂停前状态未知，无法续跑');
      }
      return ok(resumed);
    }
    case 'ARCHIVE_BATCH':
      return ok('archived');
  }
}
