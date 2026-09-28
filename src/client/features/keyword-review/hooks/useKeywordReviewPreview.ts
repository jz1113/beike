import { useMemo } from 'react';
import { countReviewRecords, selectPreviewRecords } from '../model/reviewProgress';
import type { KeywordReviewRecord, ParsedKeywordWorkbook } from '../model/keywordReviewWorkbook';

export type KeywordReviewFilter = 'all' | 'done' | 'producible' | 'rejected' | 'low_value';
export const PREVIEW_LIMIT = 240;

/** Derived table state stays separate from paid review task orchestration. */
export function useKeywordReviewPreview(records: KeywordReviewRecord[], parsed: ParsedKeywordWorkbook | null, filter: KeywordReviewFilter, lastTrialIds: string[]) {
  const counts = useMemo(() => countReviewRecords(records), [records]);

  const sheetSummary = useMemo(
    () => parsed?.sheets.map((sheet) => `${sheet.name} ${sheet.recordCount} 条`).join('、') || '',
    [parsed],
  );

  const filteredRecords = useMemo(() => filter === 'all' ? records : records.filter((record) => {
    if (filter === 'done') return record.status === 'done';
    if (filter === 'producible') return record.status === 'done' && record.producible === '制作';
    if (filter === 'rejected') return record.status === 'done' && record.producible === '不制作';
    if (filter === 'low_value') return record.status === 'done' && record.lowValue === '是';
    return true;
  }), [records, filter]);

  const previewRecords = useMemo(() => {
    const last = new Set(lastTrialIds);
    return selectPreviewRecords(filteredRecords, last, PREVIEW_LIMIT);
  }, [filteredRecords, lastTrialIds]);

  return { counts, sheetSummary, filteredRecords, previewRecords };
}
