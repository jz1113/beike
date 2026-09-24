import * as XLSX from 'xlsx';
import { KEYWORD_REVIEW_REJECT_PREFIXES, KEYWORD_VIDEO_CATEGORIES, type KeywordReviewMode, type KeywordReviewResult } from '@beike/contracts/generate';
import { saveToDownloadDir } from '@/shared/media/saveDownload';
import { buildMergedReviewedWorkbook } from './mergedReviewedWorkbook';
import { emptyDataColumns, remapSheet } from './keywordReviewSheetLayout';
import {
  REVIEW_OUTPUT_COLUMNS,
  VIDEO_REVIEW_OUTPUT_COLUMNS,
  type FieldKind,
  type KeywordReviewRecord,
  type KeywordReviewSheet,
  type OutputColumn,
  type OutputColumnKind,
  type ParsedKeywordWorkbook,
  type ReviewColumns,
} from './keywordReviewWorkbookTypes';

export { buildMergedReviewedWorkbook } from './mergedReviewedWorkbook';
export {
  REVIEW_OUTPUT_COLUMNS,
  VIDEO_REVIEW_OUTPUT_COLUMNS,
} from './keywordReviewWorkbookTypes';
export type {
  FieldKind,
  KeywordReviewRecord,
  KeywordReviewSheet,
  KeywordReviewStatus,
  OutputColumn,
  OutputColumnKind,
  ParsedKeywordWorkbook,
} from './keywordReviewWorkbookTypes';

const REVIEW_FIELD_KINDS = new Set<FieldKind>(['category', 'categoryReason', 'producible', 'rejectReason', 'lowValue']);

const reviewColumns = (mode: KeywordReviewMode) => mode === 'video' ? VIDEO_REVIEW_OUTPUT_COLUMNS : REVIEW_OUTPUT_COLUMNS;

function cellText(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell || cell.v === undefined || cell.v === null) return '';
  return String(cell.w ?? cell.v).replace(/\s+/g, ' ').trim();
}

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

function findHeader(sheet: XLSX.WorkSheet, range: XLSX.Range) {
  const maxHeaderRow = Math.min(range.e.r, range.s.r + 19);
  for (let row = range.s.r; row <= maxHeaderRow; row += 1) {
    const found: Partial<Record<FieldKind, number>> = {};
    const headers: Array<{ col: number; label: string }> = [];
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const label = cellText(sheet, row, col);
      headers.push({ col, label });
      const kind = fieldKind(label);
      if (kind && found[kind] === undefined) found[kind] = col;
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
    producibleReadCol: found.producible ?? producibleCol,
    rejectReasonReadCol: found.rejectReason,
    ...lowValue(rejectReasonCol),
  };
}

export function buildOutputColumns(
  headers: Array<{ col: number; label: string }>,
  emptyCols: Iterable<number> = [],
  found: Partial<Record<FieldKind, number>> = {},
  mode: KeywordReviewMode = 'image',
): OutputColumn[] {
  const empty = new Set(emptyCols);
  const source: OutputColumn[] = [];
  let dispatchIndex = -1;
  for (const header of headers) {
    const kind = fieldKind(header.label);
    if (kind && REVIEW_FIELD_KINDS.has(kind)) continue;
    if (mode === 'image' && isDroppableEmptyKind(kind) && empty.has(header.col)) continue;
    if (!header.label && empty.has(header.col)) continue;
    const column: OutputColumn = {
      key: sourceColumnKey(kind, header.label),
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
    sourceCol: found[column.kind as FieldKind],
  }));

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

export function splitRejectReason(value?: string): { kind: string; detail: string } | null {
  const text = value?.trim();
  if (!text) return null;
  const prefix = KEYWORD_REVIEW_REJECT_PREFIXES.find((item) => text.startsWith(`${item}：`) || text.startsWith(`${item}:`));
  if (!prefix) return { kind: '', detail: text };
  return { kind: prefix, detail: text.slice(prefix.length).replace(/^[：:]\s*/, '') };
}

export function parseKeywordWorkbookData(workbook: XLSX.WorkBook, fileName: string, mode: KeywordReviewMode = 'image'): ParsedKeywordWorkbook {
  const records: KeywordReviewRecord[] = [];
  const sheets: KeywordReviewSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const header = findHeader(sheet, range);
    if (!header) continue;
    const emptyCols = emptyDataColumns(sheet, header.row, range);
    const outputColumns = buildOutputColumns(header.headers, emptyCols, header.found, mode);
    const reviewRead = allocateReviewColumns(
      header.found,
      range.e.c,
      header.found.dispatchTime,
      mode,
    );
    let recordCount = 0;
    for (let row = header.row + 1; row <= range.e.r; row += 1) {
      const query = cellText(sheet, row, header.found.query as number);
      if (!query) continue;
      const category = header.found.category === undefined ? '' : cellText(sheet, row, header.found.category);
      const producibleRaw = cellText(sheet, row, reviewRead.producibleReadCol);
      const producible = producibleRaw === '制作' || producibleRaw === '不制作' ? producibleRaw : undefined;
      const categoryReason = reviewRead.categoryReasonReadCol === undefined ? '' : cellText(sheet, row, reviewRead.categoryReasonReadCol);
      const rejectReason = reviewRead.rejectReasonReadCol === undefined ? '' : cellText(sheet, row, reviewRead.rejectReasonReadCol);
      const lowValue = reviewRead.lowValueReadCol === undefined ? '' : cellText(sheet, row, reviewRead.lowValueReadCol);
      const alreadyReviewed = mode === 'video'
        ? Boolean(KEYWORD_VIDEO_CATEGORIES.includes(category as typeof KEYWORD_VIDEO_CATEGORIES[number])
          && producible && (lowValue === '是' || lowValue === '否'))
        : Boolean(category && producible);
      const sourceValues: Record<string, string> = {};
      for (const column of outputColumns) {
        if (column.kind !== 'source' || column.sourceCol === undefined) continue;
        sourceValues[column.key] = cellText(sheet, row, column.sourceCol);
      }
      records.push({
        id: `${sheetName}:${row + 1}`,
        sheetName,
        rowNumber: row + 1,
        query,
        expansion: header.found.expansion === undefined ? undefined : cellText(sheet, row, header.found.expansion),
        entityExpansion: header.found.entityExpansion === undefined || emptyCols.has(header.found.entityExpansion)
          ? undefined
          : cellText(sheet, row, header.found.entityExpansion),
        contentType: header.found.contentType === undefined ? undefined : cellText(sheet, row, header.found.contentType),
        status: alreadyReviewed ? 'done' : 'idle',
        category: category || undefined,
        producible,
        categoryReason: categoryReason || undefined,
        rejectReason: rejectReason || undefined,
        lowValue: lowValue === '是' || lowValue === '否' ? lowValue : undefined,
        sourceValues,
      });
      recordCount += 1;
    }
    if (recordCount > 0) {
      sheets.push({
        name: sheetName,
        headerRow: header.row,
        range,
        outputColumns,
        recordCount,
      });
    }
  }
  if (records.length === 0) throw new Error('未找到包含 query、关键词或搜索词列的有效工作表');
  return {
    workbook,
    fileName,
    mode,
    records,
    sheets,
    displayColumns: mergeOutputColumns(sheets.map((sheet) => sheet.outputColumns), mode),
  };
}

export async function parseKeywordWorkbook(file: File, mode: KeywordReviewMode = 'image'): Promise<ParsedKeywordWorkbook> {
  const workbook = /\.csv$/i.test(file.name)
    ? XLSX.read((await file.text()).replace(/^\uFEFF/, ''), { type: 'string', cellStyles: true, cellDates: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellStyles: true, cellDates: true });
  const hasVideoHeader = workbook.SheetNames.some((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet?.['!ref']) return false;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const header = findHeader(sheet, range);
    if (!header) return false;
    const labels = new Set(header.headers.map((item) => normalizeHeader(item.label)));
    return labels.has('需上传数量') && labels.has('已上传数量') && labels.has('相关拓展q');
  });
  return parseKeywordWorkbookData(workbook, file.name, hasVideoHeader ? 'video' : mode);
}

export function applyReviewResults(
  records: KeywordReviewRecord[],
  results: KeywordReviewResult[],
): KeywordReviewRecord[] {
  const byId = new Map(results.map((item) => [item.id, item]));
  return records.map((record) => {
    const result = byId.get(record.id);
    return result ? { ...record, ...result, status: 'done', error: undefined } : record;
  });
}

function cloneStyle(source: XLSX.CellObject | undefined): XLSX.CellObject['s'] | undefined {
  if (!source?.s) return undefined;
  return { ...(source.s as Record<string, unknown>) };
}

function writeCell(sheet: XLSX.WorkSheet, row: number, col: number, value: string, styleSource?: XLSX.CellObject) {
  sheet[XLSX.utils.encode_cell({ r: row, c: col })] = { t: 's', v: value, s: cloneStyle(styleSource) };
}

function reviewColumnIndex(columns: OutputColumn[], kind: OutputColumnKind): number {
  return columns.findIndex((column) => column.kind === kind);
}

export function buildReviewedWorkbook(parsed: ParsedKeywordWorkbook, records: KeywordReviewRecord[]): XLSX.WorkBook {
  const workbook: XLSX.WorkBook = {
    SheetNames: parsed.workbook.SheetNames,
    Sheets: { ...parsed.workbook.Sheets },
    Workbook: parsed.workbook.Workbook,
    Props: parsed.workbook.Props,
  };

  for (const meta of parsed.sheets) {
    const original = parsed.workbook.Sheets[meta.name];
    if (!original) continue;
    const sheet = remapSheet(original, meta.outputColumns, meta.range);
    const categoryCol = reviewColumnIndex(meta.outputColumns, 'category');
    const categoryReasonCol = reviewColumnIndex(meta.outputColumns, 'categoryReason');
    const producibleCol = reviewColumnIndex(meta.outputColumns, 'producible');
    const rejectReasonCol = reviewColumnIndex(meta.outputColumns, 'rejectReason');
    const lowValueCol = reviewColumnIndex(meta.outputColumns, 'lowValue');
    const headerSource = sheet[XLSX.utils.encode_cell({ r: meta.headerRow, c: Math.max(0, categoryCol - 1) })];
    writeCell(sheet, meta.headerRow, categoryCol, '最终垂类', headerSource);
    writeCell(sheet, meta.headerRow, categoryReasonCol, '垂类依据', headerSource);
    writeCell(sheet, meta.headerRow, producibleCol, '是否可制作', headerSource);
    writeCell(sheet, meta.headerRow, rejectReasonCol, '不制作依据', headerSource);
    if (lowValueCol >= 0) writeCell(sheet, meta.headerRow, lowValueCol, '低价值关键词', headerSource);

    for (const record of records) {
      if (record.sheetName !== meta.name || record.status !== 'done' || !record.category || !record.producible) continue;
      const row = record.rowNumber - 1;
      const styleSource = sheet[XLSX.utils.encode_cell({ r: row, c: Math.max(0, categoryCol - 1) })];
      writeCell(sheet, row, categoryCol, record.category, styleSource);
      writeCell(sheet, row, categoryReasonCol, record.categoryReason || '', styleSource);
      writeCell(sheet, row, producibleCol, record.producible, styleSource);
      writeCell(sheet, row, rejectReasonCol, record.producible === '制作' ? '' : (record.rejectReason || ''), styleSource);
      if (lowValueCol >= 0) writeCell(sheet, row, lowValueCol, record.lowValue || '', styleSource);
    }
    workbook.Sheets[meta.name] = sheet;
  }
  return workbook;
}

export async function exportReviewedWorkbook(parsed: ParsedKeywordWorkbook, records: KeywordReviewRecord[], partial = false) {
  const workbook = partial ? buildReviewedWorkbook(parsed, records) : buildMergedReviewedWorkbook(parsed, records);
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const base = parsed.fileName.replace(/\.(xlsx|xls|csv)$/i, '') || '关键词表';
  const fileName = `${base}_${parsed.mode === 'video' ? '视频' : '图文'}_${partial ? '审核进度' : '已审核'}.xlsx`;
  await saveToDownloadDir(fileName, blob);
  return fileName;
}
