import * as XLSX from 'xlsx';
import { KEYWORD_REVIEW_REJECT_PREFIXES, type KeywordReviewResult, type KeywordReviewRow } from '@beike/contracts/generate';
import { saveToDownloadDir } from '@/shared/desktop/desktopDownload';
import { buildMergedReviewedWorkbook } from './mergedReviewedWorkbook';

export { buildMergedReviewedWorkbook } from './mergedReviewedWorkbook';

export type KeywordReviewStatus = 'idle' | 'running' | 'done' | 'error';

export type FieldKind =
  | 'query'
  | 'expansion'
  | 'entityExpansion'
  | 'contentType'
  | 'sourceCategory'
  | 'dispatchTime'
  | 'category'
  | 'categoryReason'
  | 'producible'
  | 'rejectReason';

export type OutputColumnKind = 'source' | 'category' | 'categoryReason' | 'producible' | 'rejectReason';

export interface OutputColumn {
  key: string;
  label: string;
  kind: OutputColumnKind;
  sourceKind?: FieldKind;
  sourceCol?: number;
}

export interface KeywordReviewRecord extends KeywordReviewRow {
  sheetName: string;
  rowNumber: number;
  status: KeywordReviewStatus;
  category?: string;
  producible?: '制作' | '不制作';
  categoryReason?: string;
  rejectReason?: string;
  error?: string;
  submissionUncertain?: boolean;
  sourceValues: Record<string, string>;
}

export interface KeywordReviewSheet {
  name: string;
  headerRow: number;
  range: XLSX.Range;
  outputColumns: OutputColumn[];
  recordCount: number;
}

export interface ParsedKeywordWorkbook {
  workbook: XLSX.WorkBook;
  fileName: string;
  records: KeywordReviewRecord[];
  sheets: KeywordReviewSheet[];
  displayColumns: OutputColumn[];
}

interface ReviewColumns {
  categoryCol: number;
  categoryReasonCol: number;
  producibleCol: number;
  rejectReasonCol: number;
  categoryReasonReadCol?: number;
  producibleReadCol: number;
  rejectReasonReadCol?: number;
}

const REVIEW_FIELD_KINDS = new Set<FieldKind>(['category', 'categoryReason', 'producible', 'rejectReason']);

export const REVIEW_OUTPUT_COLUMNS: OutputColumn[] = [
  { key: 'category', label: '最终垂类', kind: 'category' },
  { key: 'categoryReason', label: '垂类依据', kind: 'categoryReason' },
  { key: 'producible', label: '是否可制作', kind: 'producible' },
  { key: 'rejectReason', label: '不制作依据', kind: 'rejectReason' },
];

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
): ReviewColumns {
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
  };
}

export function buildOutputColumns(
  headers: Array<{ col: number; label: string }>,
  emptyCols: Iterable<number> = [],
  found: Partial<Record<FieldKind, number>> = {},
): OutputColumn[] {
  const empty = new Set(emptyCols);
  const source: OutputColumn[] = [];
  let dispatchIndex = -1;
  for (const header of headers) {
    const kind = fieldKind(header.label);
    if (kind && REVIEW_FIELD_KINDS.has(kind)) continue;
    if (isDroppableEmptyKind(kind) && empty.has(header.col)) continue;
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

  const review = REVIEW_OUTPUT_COLUMNS.map((column) => ({
    ...column,
    sourceCol: found[column.kind as FieldKind],
  }));

  if (dispatchIndex >= 0) {
    return [...source.slice(0, dispatchIndex + 1), ...review, ...source.slice(dispatchIndex + 1)];
  }
  return [...source, ...review];
}

export function mergeOutputColumns(groups: OutputColumn[][]): OutputColumn[] {
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
    return [...source.slice(0, dispatchIndex + 1), ...REVIEW_OUTPUT_COLUMNS, ...source.slice(dispatchIndex + 1)];
  }
  return [...source, ...REVIEW_OUTPUT_COLUMNS];
}

function emptyDataColumns(sheet: XLSX.WorkSheet, headerRow: number, range: XLSX.Range): Set<number> {
  const empty = new Set<number>();
  for (let col = range.s.c; col <= range.e.c; col += 1) {
    let hasValue = false;
    for (let row = headerRow + 1; row <= range.e.r; row += 1) {
      if (cellText(sheet, row, col)) {
        hasValue = true;
        break;
      }
    }
    if (!hasValue) empty.add(col);
  }
  return empty;
}

function cloneStyle(source: XLSX.CellObject | undefined): XLSX.CellObject['s'] | undefined {
  if (!source?.s) return undefined;
  return { ...(source.s as Record<string, unknown>) };
}

function cloneCell(cell: XLSX.CellObject | undefined): XLSX.CellObject | undefined {
  if (!cell) return undefined;
  return { ...cell, s: cloneStyle(cell) };
}

export function splitRejectReason(value?: string): { kind: string; detail: string } | null {
  const text = value?.trim();
  if (!text) return null;
  const prefix = KEYWORD_REVIEW_REJECT_PREFIXES.find((item) => text.startsWith(`${item}：`) || text.startsWith(`${item}:`));
  if (!prefix) return { kind: '', detail: text };
  return { kind: prefix, detail: text.slice(prefix.length).replace(/^[：:]\s*/, '') };
}

function defaultWidth(column: OutputColumn): number {
  if (column.kind === 'category') return 16;
  if (column.kind === 'categoryReason') return 28;
  if (column.kind === 'producible') return 14;
  if (column.kind === 'rejectReason') return 24;
  if (column.sourceKind === 'query') return 18;
  if (column.sourceKind === 'expansion' || column.sourceKind === 'entityExpansion') return 28;
  if (column.sourceKind === 'contentType') return 16;
  if (column.sourceKind === 'dispatchTime') return 18;
  return 12;
}

function remapMerges(merges: XLSX.Range[] | undefined, colMap: Map<number, number>): XLSX.Range[] | undefined {
  if (!merges?.length) return undefined;
  const next = merges.flatMap((merge) => {
    const startCol = colMap.get(merge.s.c);
    const endCol = colMap.get(merge.e.c);
    if (startCol === undefined || endCol === undefined) return [];
    return [{ s: { r: merge.s.r, c: startCol }, e: { r: merge.e.r, c: endCol } }];
  });
  return next.length > 0 ? next : undefined;
}

function remapSheet(sheet: XLSX.WorkSheet, outputColumns: OutputColumn[], range: XLSX.Range): XLSX.WorkSheet {
  const next: XLSX.WorkSheet = {};
  const oldCols = sheet['!cols'] || [];
  const newCols: XLSX.ColInfo[] = [];
  const colMap = new Map<number, number>();

  for (let newCol = 0; newCol < outputColumns.length; newCol += 1) {
    const column = outputColumns[newCol];
    const inherited = column.sourceCol !== undefined ? oldCols[column.sourceCol] : undefined;
    newCols[newCol] = inherited ? { ...inherited } : { wch: defaultWidth(column) };
    if (column.sourceCol === undefined) continue;
    colMap.set(column.sourceCol, newCol);
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const from = cloneCell(sheet[XLSX.utils.encode_cell({ r: row, c: column.sourceCol })]);
      if (from) next[XLSX.utils.encode_cell({ r: row, c: newCol })] = from;
    }
  }

  next['!ref'] = XLSX.utils.encode_range({
    s: { r: range.s.r, c: 0 },
    e: { r: range.e.r, c: Math.max(0, outputColumns.length - 1) },
  });
  next['!cols'] = newCols;
  if (sheet['!rows']) next['!rows'] = sheet['!rows'];
  const merges = remapMerges(sheet['!merges'], colMap);
  if (merges) next['!merges'] = merges;
  if (sheet['!freeze']) next['!freeze'] = sheet['!freeze'];
  if (sheet['!autofilter']?.ref) {
    const filter = XLSX.utils.decode_range(sheet['!autofilter'].ref);
    next['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: filter.s.r, c: 0 },
        e: { r: filter.e.r, c: Math.max(0, outputColumns.length - 1) },
      }),
    };
  }
  return next;
}

export function parseKeywordWorkbookData(workbook: XLSX.WorkBook, fileName: string): ParsedKeywordWorkbook {
  const records: KeywordReviewRecord[] = [];
  const sheets: KeywordReviewSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const header = findHeader(sheet, range);
    if (!header) continue;
    const emptyCols = emptyDataColumns(sheet, header.row, range);
    const outputColumns = buildOutputColumns(header.headers, emptyCols, header.found);
    const reviewRead = allocateReviewColumns(
      header.found,
      range.e.c,
      header.found.dispatchTime,
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
      const alreadyReviewed = Boolean(category && producible);
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
    records,
    sheets,
    displayColumns: mergeOutputColumns(sheets.map((sheet) => sheet.outputColumns)),
  };
}

export async function parseKeywordWorkbook(file: File): Promise<ParsedKeywordWorkbook> {
  const workbook = /\.csv$/i.test(file.name)
    ? XLSX.read((await file.text()).replace(/^\uFEFF/, ''), { type: 'string', cellStyles: true, cellDates: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellStyles: true, cellDates: true });
  return parseKeywordWorkbookData(workbook, file.name);
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
    const headerSource = sheet[XLSX.utils.encode_cell({ r: meta.headerRow, c: Math.max(0, categoryCol - 1) })];
    writeCell(sheet, meta.headerRow, categoryCol, '最终垂类', headerSource);
    writeCell(sheet, meta.headerRow, categoryReasonCol, '垂类依据', headerSource);
    writeCell(sheet, meta.headerRow, producibleCol, '是否可制作', headerSource);
    writeCell(sheet, meta.headerRow, rejectReasonCol, '不制作依据', headerSource);

    for (const record of records) {
      if (record.sheetName !== meta.name || record.status !== 'done' || !record.category || !record.producible) continue;
      const row = record.rowNumber - 1;
      const styleSource = sheet[XLSX.utils.encode_cell({ r: row, c: Math.max(0, categoryCol - 1) })];
      writeCell(sheet, row, categoryCol, record.category, styleSource);
      writeCell(sheet, row, categoryReasonCol, record.categoryReason || '', styleSource);
      writeCell(sheet, row, producibleCol, record.producible, styleSource);
      writeCell(sheet, row, rejectReasonCol, record.producible === '制作' ? '' : (record.rejectReason || ''), styleSource);
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
  const fileName = `${base}_${partial ? '审核进度' : '已审核'}.xlsx`;
  await saveToDownloadDir(fileName, blob);
  return fileName;
}
