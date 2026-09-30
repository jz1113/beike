import type { KeywordReviewMode, KeywordReviewRow } from '@shared/contracts/generate';

/** The durable description of one request, without credentials. */
export interface ReviewSubmission {
  idempotencyKey: string;
  attemptId: string;
  dispatchedAt: number;
  rows: KeywordReviewRow[];
  model: string;
  provider: 'deepseek' | 'gateway';
  baseUrl: string;
  reviewMode: KeywordReviewMode;
  rulesVersion: number;
  lookup: boolean;
  lookupBudget?: number;
}

export type PendingKeywordReviewSubmission = ReviewSubmission;
