import type { KeywordReviewResult } from '@shared/contracts/generate';
import type { KeywordReviewRecord } from './keywordReviewWorkbook';

export function isRecoverableModelOutputError(status: number, code?: string): boolean {
  // An upstream DeepSeek 502 must not split an already billed keyword batch.
  return status === 502 && code === 'model_output_invalid';
}

/** Error text cannot establish whether an unknown submission was billed. */
export function isAutomaticRetryRecord(record: { status: string; error?: string; submissionUncertain?: boolean }): boolean {
  return record.status === 'error' && !record.submissionUncertain;
}

/** Submission may already have been billed, so it must not be sent again automatically. */
export function isIsolatedSubmission(record: { status: string; error?: string; submissionUncertain?: boolean }): boolean {
  return record.status === 'error' && record.submissionUncertain === true;
}

export function advanceAutomaticRetryVersions(
  records: KeywordReviewRecord[], indices: Map<string, number>, versions: Map<number, number>,
): void {
  for (const record of records) {
    if (!isAutomaticRetryRecord(record)) continue;
    const index = indices.get(record.id);
    if (index !== undefined) versions.set(index, (versions.get(index) ?? 0) + 1);
  }
}

export function updateReviewRecords(
  records: KeywordReviewRecord[],
  indices: Map<string, number>,
  ids: string[],
  update: (record: KeywordReviewRecord) => KeywordReviewRecord,
): KeywordReviewRecord[] {
  const next = records.slice();
  for (const id of ids) {
    const index = indices.get(id);
    if (index !== undefined) next[index] = update(next[index]);
  }
  return next;
}

export function applyBatchResults(
  records: KeywordReviewRecord[],
  indices: Map<string, number>,
  results: KeywordReviewResult[],
): KeywordReviewRecord[] {
  const next = records.slice();
  for (const result of results) {
    const index = indices.get(result.id);
    if (index !== undefined) next[index] = { ...next[index], ...result, status: 'done', error: undefined, submissionUncertain: false };
  }
  return next;
}

export function countReviewRecords(records: KeywordReviewRecord[]) {
  const counts = { total: records.length, done: 0, failed: 0, uncertain: 0, pending: 0, running: 0, producible: 0, rejected: 0, lowValue: 0 };
  for (const record of records) {
    if (record.status === 'done') {
      counts.done += 1;
      if (record.lowValue === '是') counts.lowValue += 1;
      if (record.producible === '制作') counts.producible += 1;
      else if (record.producible === '不制作') counts.rejected += 1;
    }
    else if (record.status === 'error') {
      counts.failed += 1;
      if (isIsolatedSubmission(record)) counts.uncertain += 1;
    }
    else if (record.status === 'idle') counts.pending += 1;
    else if (record.status === 'running') counts.running += 1;
  }
  return counts;
}
