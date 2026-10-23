import * as XLSX from 'xlsx';
import type { KeywordReviewMode } from '@shared/contracts/generate';
import { cellText, preserveColumnOrder } from './keywordReviewSheetLayout';
import { REVIEW_OUTPUT_COLUMNS, VIDEO_REVIEW_OUTPUT_COLUMNS, type FieldKind, type OutputColumn, type ReviewColumns } from './keywordReviewWorkbookTypes';

const reviewColumns = (mode: KeywordReviewMode) => mode === 'video' ? VIDEO_REVIEW_OUTPUT_COLUMNS : REVIEW_OUTPUT_COLUMNS;
const REVIEW_FIELDS = new Set<FieldKind>(['category', 'categoryReason', 'producible', 'rejectReason', 'lowValue']);

export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_:：\p{Ps}\p{Pe}-]/gu, '');
}

export function fieldKind(value: string): FieldKind | null {
  const header = normalizeHeader(value);
  if (['query', '关键词', '搜索词', '主关键词'].includes(header)) return 'query';
  if (['相关拓展q', '相关拓展词', '相关拓展', '拓展q', '拓展词'].includes(header)) return 'expansion';
  if (['实体拓展q', '实体拓展词', '实体拓展'].includes(header)) return 'entityExpansion';
  if (['笔记内容类型', '内容类型', '笔记内容'].includes(header)) return 'contentType';
  if (header === '分类') return 'sourceCategory';
  if (header === '下发时间') return 'dispatchTime';
  if (header === '最终垂类') return 'category';
  if (header === '垂类依据') return 'categoryReason';
  if (header === '是否可制作') return 'producible';
  if (header === '不制作依据') return 'rejectReason';
  if (header === '低价值关键词') return 'lowValue';
  return null;
}

export function isDroppableEmptyKind(kind: FieldKind | null): boolean {
  return kind === 'entityExpansion' || kind === 'sourceCategory';
}

export function sourceColumnKey(kind: FieldKind | null, label: string): string {
  if (kind === 'query') return 'query';
  if (kind === 'expansion') return 'expansion';
  if (kind === 'entityExpansion') return 'entityExpansion';
  if (kind === 'contentType') return 'contentType';
  if (kind === 'sourceCategory') return 'sourceCategory';
  if (kind === 'dispatchTime') return 'dispatchTime';
  const normalized = normalizeHeader(label);
  return normalized ? `source:${normalized}` : `source:${label || 'blank'}`;
}

export function findKeywordHeader(sheet: XLSX.WorkSheet, range: XLSX.Range, formulaCols: Set<number>) {
  const maxHeaderRow = Math.min(range.e.r, range.s.r + 19);
  for (let row = range.s.r; row <= maxHeaderRow; row += 1) {
    const found: Partial<Record<FieldKind, number>> = {};
    const headers: Array<{ col: number; label: string }> = [];
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const label = cellText(sheet, row, col).trim();
      headers.push({ col, label });
      const kind = fieldKind(label);
      if (kind && (found[kind] === undefined || (REVIEW_FIELDS.has(kind) && formulaCols.has(found[kind] ?? -1) && !formulaCols.has(col)))) found[kind] = col;
    }
    if (found.query !== undefined) return { row, found, headers };
  }
  return null;
}

export function allocateReviewColumns(
  found: Partial<Record<FieldKind, number>>,
  lastCol: number,
  insertAfterCol?: number,
  mode: KeywordReviewMode = 'image',
): ReviewColumns {
  const lowValue = (rejectReasonCol: number): Pick<ReviewColumns, 'lowValueCol' | 'lowValueReadCol'> => mode === 'video'
    ? { lowValueCol: found.lowValue ?? Math.max(lastCol + 1, rejectReasonCol + 1), lowValueReadCol: found.lowValue }
    : {};
  if (
    found.category !== undefined
    && found.categoryReason !== undefined
    && found.producible !== undefined
    && found.rejectReason !== undefined
  ) {
    return {
      categoryCol: found.category,
      categoryReasonCol: found.categoryReason,
      producibleCol: found.producible,
      rejectReasonCol: found.rejectReason,
      categoryReasonReadCol: found.categoryReason,
      producibleReadCol: found.producible,
      rejectReasonReadCol: found.rejectReason,
      ...lowValue(found.rejectReason),
    };
  }

  if (
    found.category !== undefined
    && found.producible === found.category + 1
    && lastCol <= found.producible
    && found.categoryReason === undefined
    && found.rejectReason === undefined
  ) {
    return {
      categoryCol: found.category,
      categoryReasonCol: found.category + 1,
      producibleCol: found.category + 2,
      rejectReasonCol: found.category + 3,
      producibleReadCol: found.producible,
      ...lowValue(found.category + 3),
    };
  }

  let next = (insertAfterCol ?? lastCol) + 1;
  const take = (value: number | undefined) => {
    if (value !== undefined) return value;
    const col = next;
    next += 1;
    return col;
  };
  const categoryCol = take(found.category);
  const categoryReasonCol = take(found.categoryReason);
  const producibleCol = take(found.producible);
  const rejectReasonCol = take(found.rejectReason);
  return {
    categoryCol,
    categoryReasonCol,
    producibleCol,
    rejectReasonCol,
    categoryReasonReadCol: found.categoryReason,
    producibleReadCol: found.producible,
    rejectReasonReadCol: found.rejectReason,
    ...lowValue(rejectReasonCol),
  };
}

export function buildOutputColumns(
  headers: Array<{ col: number; label: string }>,
  emptyCols: Iterable<number> = [],
  found: Partial<Record<FieldKind, number>> = {},
  mode: KeywordReviewMode = 'image',
  preserveOrder = false,
  formulaCols = new Set<number>(),
): OutputColumn[] {
  const empty = new Set(emptyCols);
  const source: OutputColumn[] = [];
  const keyCounts = new Map<string, number>();
  const activeReviewKinds = new Set<string>(reviewColumns(mode).map((column) => column.kind));
  const primaryReviewCols = { ...found };
  let dispatchIndex = -1;
  for (const header of headers) {
    const kind = fieldKind(header.label);
    if (kind && activeReviewKinds.has(kind)) {
      primaryReviewCols[kind] ??= header.col;
      if (primaryReviewCols[kind] === header.col && !formulaCols.has(header.col)) continue;
    }
    if (!preserveOrder && mode === 'image' && isDroppableEmptyKind(kind) && empty.has(header.col)) continue;
    if (!preserveOrder && !header.label && empty.has(header.col)) continue;
    const baseKey = header.label ? sourceColumnKey(kind, header.label) : `source:unlabeled:${header.col}`;
    const occurrence = (keyCounts.get(baseKey) || 0) + 1;
    keyCounts.set(baseKey, occurrence);
    const column: OutputColumn = {
      key: occurrence === 1 ? baseKey : `${baseKey}:duplicate:${occurrence}`,
      label: header.label || `列${header.col + 1}`,
      kind: 'source',
      sourceKind: kind || undefined,
      sourceCol: header.col,
    };
    source.push(column);
    if (kind === 'dispatchTime') dispatchIndex = source.length - 1;
  }

  const review = reviewColumns(mode).map((column) => ({
    ...column,
    sourceCol: formulaCols.has(primaryReviewCols[column.kind as FieldKind] ?? -1) ? undefined : primaryReviewCols[column.kind as FieldKind],
  }));

  if (preserveOrder) return preserveColumnOrder(source, review, headers[0]?.col || 0);

  if (dispatchIndex >= 0) {
    return [...source.slice(0, dispatchIndex + 1), ...review, ...source.slice(dispatchIndex + 1)];
  }
  return [...source, ...review];
}

export function mergeOutputColumns(groups: OutputColumn[][], mode: KeywordReviewMode = 'image'): OutputColumn[] {
  const source: OutputColumn[] = [];
  const seen = new Set<string>();
  let dispatchIndex = -1;
  for (const columns of groups) {
    for (const column of columns) {
      if (column.kind !== 'source' || seen.has(column.key)) continue;
      seen.add(column.key);
      source.push({
        key: column.key,
        label: column.label,
        kind: 'source',
        sourceKind: column.sourceKind,
      });
      if (column.sourceKind === 'dispatchTime') dispatchIndex = source.length - 1;
    }
  }
  if (dispatchIndex >= 0) {
    return [...source.slice(0, dispatchIndex + 1), ...reviewColumns(mode), ...source.slice(dispatchIndex + 1)];
  }
  return [...source, ...reviewColumns(mode)];
}

