import type { KeywordReviewResult } from '@beike/contracts/generate';
import type { KeywordReviewRecord } from './keywordReviewWorkbook';

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
    if (index !== undefined) next[index] = { ...next[index], ...result, status: 'done', error: undefined };
  }
  return next;
}

export function selectPreviewRecords(
  records: KeywordReviewRecord[],
  lastTrialIds: Set<string>,
  limit: number,
): KeywordReviewRecord[] {
  const groups: KeywordReviewRecord[][] = [[], [], [], []];
  for (const record of records) {
    const rank = record.status === 'running' ? 0
      : record.status === 'error' ? 1
        : lastTrialIds.has(record.id) ? 2 : 3;
    if (groups[rank].length < limit) groups[rank].push(record);
  }
  return groups.flat().slice(0, limit);
}

export function countReviewRecords(records: KeywordReviewRecord[]) {
  const counts = { total: records.length, done: 0, failed: 0, pending: 0, producible: 0, rejected: 0 };
  for (const record of records) {
    if (record.status === 'done') counts.done += 1;
    else if (record.status === 'error') counts.failed += 1;
    else if (record.status === 'idle') counts.pending += 1;
    if (record.producible === '制作') counts.producible += 1;
    else if (record.producible === '不制作') counts.rejected += 1;
  }
  return counts;
}
