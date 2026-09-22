import * as XLSX from 'xlsx';
import type { KeywordReviewResult, KeywordReviewRow } from '@beike/contracts/generate';
import { saveToDownloadDir } from '@/shared/desktop/desktopDownload';

export type KeywordReviewStatus = 'idle' | 'running' | 'done' | 'error';

export interface KeywordReviewRecord extends KeywordReviewRow {
  sheetName: string;
  rowNumber: number;
  status: KeywordReviewStatus;
  category?: string;
  producible?: '制作' | '不制作';
  error?: string;
}

export interface KeywordReviewSheet {
  name: string;
  headerRow: number;
  categoryCol: number;
  producibleCol: number;
  recordCount: number;
}

export interface ParsedKeywordWorkbook {
  workbook: XLSX.WorkBook;
  fileName: string;
  records: KeywordReviewRecord[];
  sheets: KeywordReviewSheet[];
}

function cellText(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell || cell.v === undefined || cell.v === null) return '';
  return String(cell.w ?? cell.v).replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_:：\p{Ps}\p{Pe}-]/gu, '');
}

function fieldKind(value: string): 'query' | 'expansion' | 'entityExpansion' | 'contentType' | 'category' | 'producible' | null {
  const header = normalizeHeader(value);
  if (['query', '关键词', '搜索词', '主关键词'].includes(header)) return 'query';
  if (['相关拓展q', '相关拓展词', '拓展q', '拓展词'].includes(header)) return 'expansion';
  if (['实体拓展q', '实体拓展词', '实体拓展'].includes(header)) return 'entityExpansion';
  if (['笔记内容类型', '内容类型'].includes(header)) return 'contentType';
  if (header === '最终垂类') return 'category';
  if (header === '是否可制作') return 'producible';
  return null;
}

function findHeader(sheet: XLSX.WorkSheet, range: XLSX.Range) {
  const maxHeaderRow = Math.min(range.e.r, range.s.r + 19);
  for (let row = range.s.r; row <= maxHeaderRow; row += 1) {
    const found: Partial<Record<NonNullable<ReturnType<typeof fieldKind>>, number>> = {};
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const kind = fieldKind(cellText(sheet, row, col));
      if (kind && found[kind] === undefined) found[kind] = col;
    }
    if (found.query !== undefined) return { row, found };
  }
  return null;
}

function cloneStyle(source: XLSX.CellObject | undefined): XLSX.CellObject['s'] | undefined {
  if (!source?.s) return undefined;
  return { ...(source.s as Record<string, unknown>) };
}

export async function parseKeywordWorkbook(file: File): Promise<ParsedKeywordWorkbook> {
  const workbook = /\.csv$/i.test(file.name)
    ? XLSX.read((await file.text()).replace(/^\uFEFF/, ''), { type: 'string', cellStyles: true, cellDates: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellStyles: true, cellDates: true });
  const records: KeywordReviewRecord[] = [];
  const sheets: KeywordReviewSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const header = findHeader(sheet, range);
    if (!header) continue;
    const categoryCol = header.found.category ?? range.e.c + 1;
    const producibleCol = header.found.producible ?? Math.max(range.e.c + 1, categoryCol + 1);
    let recordCount = 0;
    for (let row = header.row + 1; row <= range.e.r; row += 1) {
      const query = cellText(sheet, row, header.found.query as number);
      if (!query) continue;
      const category = cellText(sheet, row, categoryCol);
      const producibleRaw = cellText(sheet, row, producibleCol);
      const producible = producibleRaw === '制作' || producibleRaw === '不制作' ? producibleRaw : undefined;
      const alreadyReviewed = Boolean(category && producible);
      records.push({
        id: `${sheetName}:${row + 1}`,
        sheetName,
        rowNumber: row + 1,
        query,
        expansion: header.found.expansion === undefined ? undefined : cellText(sheet, row, header.found.expansion),
        entityExpansion: header.found.entityExpansion === undefined ? undefined : cellText(sheet, row, header.found.entityExpansion),
        contentType: header.found.contentType === undefined ? undefined : cellText(sheet, row, header.found.contentType),
        status: alreadyReviewed ? 'done' : 'idle',
        category: category || undefined,
        producible,
      });
      recordCount += 1;
    }
    if (recordCount > 0) {
      sheets.push({ name: sheetName, headerRow: header.row, categoryCol, producibleCol, recordCount });
    }
  }
  if (records.length === 0) throw new Error('未找到包含 query、关键词或搜索词列的有效工作表');
  return { workbook, fileName: file.name, records, sheets };
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

export async function exportReviewedWorkbook(parsed: ParsedKeywordWorkbook, records: KeywordReviewRecord[]) {
  const bySheet = new Map(parsed.sheets.map((sheet) => [sheet.name, sheet]));
  for (const record of records) {
    if (record.status !== 'done' || !record.category || !record.producible) continue;
    const meta = bySheet.get(record.sheetName);
    const sheet = parsed.workbook.Sheets[record.sheetName];
    if (!meta || !sheet) continue;
    const row = record.rowNumber - 1;
    const categoryAddress = XLSX.utils.encode_cell({ r: row, c: meta.categoryCol });
    const producibleAddress = XLSX.utils.encode_cell({ r: row, c: meta.producibleCol });
    const styleSource = sheet[XLSX.utils.encode_cell({ r: row, c: Math.max(0, meta.categoryCol - 1) })];
    sheet[categoryAddress] = { t: 's', v: record.category, s: cloneStyle(styleSource) };
    sheet[producibleAddress] = { t: 's', v: record.producible, s: cloneStyle(styleSource) };
  }
  for (const meta of parsed.sheets) {
    const sheet = parsed.workbook.Sheets[meta.name];
    const headerSource = sheet[XLSX.utils.encode_cell({ r: meta.headerRow, c: Math.max(0, meta.categoryCol - 1) })];
    sheet[XLSX.utils.encode_cell({ r: meta.headerRow, c: meta.categoryCol })] = { t: 's', v: '最终垂类', s: cloneStyle(headerSource) };
    sheet[XLSX.utils.encode_cell({ r: meta.headerRow, c: meta.producibleCol })] = { t: 's', v: '是否可制作', s: cloneStyle(headerSource) };
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    range.e.c = Math.max(range.e.c, meta.categoryCol, meta.producibleCol);
    sheet['!ref'] = XLSX.utils.encode_range(range);
    const widths = sheet['!cols'] || [];
    widths[meta.categoryCol] = widths[meta.categoryCol] || { wch: 16 };
    widths[meta.producibleCol] = widths[meta.producibleCol] || { wch: 14 };
    sheet['!cols'] = widths;
  }
  const bytes = XLSX.write(parsed.workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const base = parsed.fileName.replace(/\.(xlsx|xls|csv)$/i, '') || '关键词表';
  const fileName = `${base}_已审核.xlsx`;
  await saveToDownloadDir(fileName, blob);
  return fileName;
}
