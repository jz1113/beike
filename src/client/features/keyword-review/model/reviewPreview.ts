import type { KeywordReviewRecord } from './keywordReviewWorkbook';

export type KeywordReviewFilter = 'all' | 'pending' | 'running' | 'done' | 'producible' | 'rejected' | 'failed' | 'uncertain' | 'low_value';
export const REVIEW_FILTER_LABELS: Record<KeywordReviewFilter, string> = {
  all: '全部', pending: '待审核', running: '审核中', done: '已完成', producible: '可制作',
  rejected: '不制作', failed: '失败', uncertain: '待核对', low_value: '低价值',
};

const sourceSearchCache = new WeakMap<KeywordReviewRecord['sourceValues'], string[]>();
const recordSearchCache = new WeakMap<KeywordReviewRecord, { status: KeywordReviewRecord['status']; fields: string[]; source: string[] }>();

function searchIndex(record: KeywordReviewRecord) {
  const cached = recordSearchCache.get(record);
  if (cached?.status === record.status) return cached;
  let source = sourceSearchCache.get(record.sourceValues);
  if (source === undefined) {
    source = Object.values(record.sourceValues).map((value) => value.toLocaleLowerCase());
    sourceSearchCache.set(record.sourceValues, source);
  }
  const results = record.status === 'done'
    ? [record.category, record.categoryReason, record.producible, record.rejectReason, record.lowValue]
    : record.status === 'error' ? [record.error] : [];
  const index = {
    status: record.status,
    fields: [record.query, record.expansion, record.entityExpansion, record.contentType, ...results].filter((value): value is string => Boolean(value)).map((value) => value.toLocaleLowerCase()),
    source,
  };
  recordSearchCache.set(record, index);
  return index;
}

/** Review updates replace records; immutable sourceValues can reuse their separate index. */
export function warmReviewSearchIndex(record: KeywordReviewRecord) {
  searchIndex(record);
}

export function filterReviewRecords(records: KeywordReviewRecord[], filter: KeywordReviewFilter, search = '', sheet = '', category = '') {
  const term = search.trim().toLocaleLowerCase();
  if (filter === 'all' && !term && !sheet && !category) return records;
  return records.filter((record) => {
    if (sheet && record.sheetName !== sheet) return false;
    if (category && (record.status !== 'done' || record.category !== category)) return false;
    if (filter === 'pending' && record.status !== 'idle') return false;
    if (filter === 'running' && record.status !== 'running') return false;
    if (filter === 'done' && record.status !== 'done') return false;
    if (filter === 'failed' && (record.status !== 'error' || record.submissionUncertain)) return false;
    if (filter === 'uncertain' && (record.status !== 'error' || !record.submissionUncertain)) return false;
    if (filter === 'producible' && (record.status !== 'done' || record.producible !== '制作')) return false;
    if (filter === 'rejected' && (record.status !== 'done' || record.producible !== '不制作')) return false;
    if (filter === 'low_value' && (record.status !== 'done' || record.lowValue !== '是')) return false;
    if (!term) return true;
    const index = searchIndex(record);
    return index.fields.some((value) => value.includes(term)) || index.source.some((value) => value.includes(term));
  });
}
