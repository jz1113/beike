import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import { countReviewRecords } from '../model/reviewProgress';
import { filterReviewRecords, warmReviewSearchIndex, type KeywordReviewFilter } from '../model/reviewPreview';
import type { KeywordReviewRecord, ParsedKeywordWorkbook } from '../model/keywordReviewWorkbook';

export type { KeywordReviewFilter } from '../model/reviewPreview';
export const PREVIEW_LIMIT = 50;

/** Derived table state stays separate from paid review task orchestration. */
export function useKeywordReviewPreview(records: KeywordReviewRecord[], parsed: ParsedKeywordWorkbook | null, filter: KeywordReviewFilter) {
  const [search, setSearch] = useState('');
  const [sheetFilter, setSheetFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [pagination, setPagination] = useState({ scope: '', page: 1 });
  const deferredSearch = useDeferredValue(search);
  const visible = useViewVisibility();
  const counts = useMemo(() => countReviewRecords(records), [records]);

  useEffect(() => {
    if (!visible || records.length < 1000) return;
    let index = 0;
    let cancelled = false;
    let handle = 0;
    const idleSupported = typeof window.requestIdleCallback === 'function';
    const warm = (deadline?: IdleDeadline) => {
      if (cancelled) return;
      const until = performance.now() + 4;
      do { warmReviewSearchIndex(records[index++]); }
      while (index < records.length && performance.now() < until && (!deadline || deadline.timeRemaining() > 1));
      if (index < records.length) schedule();
    };
    const schedule = () => {
      handle = idleSupported ? window.requestIdleCallback(warm, { timeout: 500 }) : window.setTimeout(warm, 16);
    };
    schedule();
    return () => {
      cancelled = true;
      if (idleSupported) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [records, visible]);

  const categories = useMemo(() => [...new Set(records.filter((record) => record.status === 'done').map((record) => record.category).filter((category): category is string => Boolean(category)))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [records]);
  const filteredRecords = useMemo(() => filterReviewRecords(records, filter, deferredSearch, sheetFilter, categoryFilter), [records, filter, deferredSearch, sheetFilter, categoryFilter]);
  const scope = JSON.stringify([filter, deferredSearch, sheetFilter, categoryFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PREVIEW_LIMIT));
  const currentPage = pagination.scope === scope ? Math.min(pagination.page, pageCount) : 1;
  const previewRecords = useMemo(() => filteredRecords.slice((currentPage - 1) * PREVIEW_LIMIT, currentPage * PREVIEW_LIMIT), [filteredRecords, currentPage]);
  const setPage = (page: number) => setPagination({ scope, page: Math.max(1, Math.min(Math.trunc(page), pageCount)) });

  useEffect(() => {
    setPagination((current) => current.scope === scope && current.page === currentPage ? current : { scope, page: currentPage });
  }, [scope, currentPage]);
  useEffect(() => {
    setSearch(''); setSheetFilter(''); setCategoryFilter(''); setPagination({ scope: '', page: 1 });
  }, [parsed]);

  return {
    counts, filteredRecords, previewRecords, search, setSearch, sheetFilter, setSheetFilter,
    categoryFilter, setCategoryFilter, categories, page: currentPage, pageCount, setPage,
    searchPending: search !== deferredSearch,
    previewStart: filteredRecords.length ? (currentPage - 1) * PREVIEW_LIMIT + 1 : 0,
    previewEnd: Math.min(currentPage * PREVIEW_LIMIT, filteredRecords.length),
  };
}
