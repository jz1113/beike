import * as XLSX from 'xlsx';
import { KEYWORD_REVIEW_REJECT_PREFIXES, type KeywordReviewMode, type KeywordReviewResult } from '@shared/contracts/generate';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { buildMergedReviewedWorkbook } from './mergedReviewedWorkbook';
import { buildReviewedWorkbook } from './keywordReviewWorkbookExport';
import { cellText, dataRows, effectiveSheetRange, emptyDataColumns, formulaColumns, hasInternalLinks, hasNonKeywordRows, sheetHasData } from './keywordReviewSheetLayout';
import { allocateReviewColumns, buildOutputColumns, findKeywordHeader, mergeOutputColumns } from './keywordReviewColumns';
import { isProgressStateSheet, restoreWorkbookProgress, workbookReviewMode } from './keywordReviewWorkbookState';
import { isValidReviewVerdict } from './keywordReviewVerdict';
import type {
  KeywordReviewRecord,
  KeywordReviewSheet,
  ParsedKeywordWorkbook,
} from './keywordReviewWorkbookTypes';

export { buildMergedReviewedWorkbook } from './mergedReviewedWorkbook';
export { buildReviewedWorkbook } from './keywordReviewWorkbookExport';
export { normalizeHeader, fieldKind, isDroppableEmptyKind, sourceColumnKey, allocateReviewColumns, buildOutputColumns, mergeOutputColumns } from './keywordReviewColumns';
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
  const formulasBySheet = new Map(Object.entries(workbook.Sheets).map(([name, sheet]) => [name, formulaColumns(sheet)]));
  const hasFormulas = [...formulasBySheet.values()].some((cols) => cols.size > 0);
  const internalLinks = Object.values(workbook.Sheets).some(hasInternalLinks);
  const hasDefinedNames = Boolean(workbook.Workbook?.Names?.length);
  let preserveSourceLayout = hasFormulas || internalLinks || hasDefinedNames;
  let sourceReviewMode = workbookReviewMode(workbook);
  let reviewModeMismatch = sourceReviewMode !== undefined && sourceReviewMode !== mode;
  const layouts = new Map<string, { header: NonNullable<ReturnType<typeof findKeywordHeader>>; emptyCols: Set<number>; formulaCols: Set<number> }>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || isProgressStateSheet(sheet)) continue;
    const range = effectiveSheetRange(sheet);
    if (!range) continue;
    const formulaCols = formulasBySheet.get(sheetName) || new Set<number>();
    const header = findKeywordHeader(sheet, range, formulaCols);
    if (!header) continue;
    if (hasNonKeywordRows(sheet, header.found.query as number, header.row)) preserveSourceLayout = true;
    const emptyCols = emptyDataColumns(sheet, header.row, range);
    layouts.set(sheetName, { header, emptyCols, formulaCols });
    const outputColumns = buildOutputColumns(header.headers, emptyCols, header.found, mode, preserveSourceLayout, formulaCols);
    const reviewRead = allocateReviewColumns(
      header.found,
      range.e.c,
      header.found.dispatchTime,
      mode,
    );
    let recordCount = 0;
    for (const row of dataRows(sheet, header.found.query as number, header.row)) {
      const query = cellText(sheet, row, header.found.query as number);
      if (!query.trim()) continue;
      const category = header.found.category === undefined ? '' : cellText(sheet, row, header.found.category).trim();
      const producibleRaw = reviewRead.producibleReadCol === undefined ? '' : cellText(sheet, row, reviewRead.producibleReadCol).trim();
      const producible = producibleRaw === '制作' || producibleRaw === '不制作' ? producibleRaw : undefined;
      const categoryReason = reviewRead.categoryReasonReadCol === undefined ? '' : cellText(sheet, row, reviewRead.categoryReasonReadCol).trim();
      const rejectReason = reviewRead.rejectReasonReadCol === undefined ? '' : cellText(sheet, row, reviewRead.rejectReasonReadCol).trim();
      const lowValue = reviewRead.lowValueReadCol === undefined ? '' : cellText(sheet, row, reviewRead.lowValueReadCol).trim();
      const lowValueFlag = lowValue === '是' || lowValue === '否' ? lowValue : undefined;
      const clearVerdict = reviewModeMismatch || (mode === 'video' && lowValueFlag === '是' && producible === '制作');
      const alreadyReviewed = !clearVerdict && isValidReviewVerdict({ category, producible, lowValue: lowValueFlag }, mode);
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
        category: clearVerdict ? undefined : category || undefined,
        producible: clearVerdict ? undefined : producible,
        categoryReason: clearVerdict ? undefined : categoryReason || undefined,
        rejectReason: clearVerdict ? undefined : rejectReason || undefined,
        lowValue: clearVerdict ? undefined : lowValueFlag,
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
  if (!sourceReviewMode && records.some((record) => record.category && record.producible)) {
    const legacyVideo = [...layouts.values()].some(({ header }) => header.found.category !== undefined
      && header.found.producible !== undefined && header.found.lowValue !== undefined);
    sourceReviewMode = legacyVideo ? 'video' : 'image';
    reviewModeMismatch = sourceReviewMode !== mode;
    if (reviewModeMismatch) {
      for (const record of records) {
        record.status = 'idle';
        record.category = record.producible = record.categoryReason = record.rejectReason = record.lowValue = undefined;
      }
    }
  }
  const reviewedNames = new Set(sheets.map((sheet) => sheet.name));
  const hasAuxiliarySheets = workbook.SheetNames.some((name) => !reviewedNames.has(name)
    && workbook.Sheets[name] && !isProgressStateSheet(workbook.Sheets[name]) && sheetHasData(workbook.Sheets[name]));
  if (hasAuxiliarySheets) preserveSourceLayout = true;
  if (preserveSourceLayout) {
    for (const sheet of sheets) {
      const layout = layouts.get(sheet.name)!;
      sheet.outputColumns = buildOutputColumns(layout.header.headers, layout.emptyCols, layout.header.found, mode, true, layout.formulaCols);
    }
  }
  restoreWorkbookProgress(workbook, records, mode);
  return {
    workbook,
    fileName,
    mode,
    hasFormulas,
    sourceReviewMode,
    reviewModeMismatch,
    preserveSourceLayout,
    hasInternalLinks: internalLinks,
    hasDefinedNames,
    hasAuxiliarySheets,
    records,
    sheets,
    displayColumns: mergeOutputColumns(sheets.map((sheet) => sheet.outputColumns), mode),
  };
}

export async function parseKeywordWorkbook(file: File, mode: KeywordReviewMode = 'image'): Promise<ParsedKeywordWorkbook> {
  const workbook = /\.csv$/i.test(file.name)
    ? XLSX.read((await file.text()).replace(/^\uFEFF/, ''), { type: 'string', raw: true, cellStyles: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellStyles: true, cellDates: true });
  return parseKeywordWorkbookData(workbook, file.name, mode);
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

export async function exportReviewedWorkbook(parsed: ParsedKeywordWorkbook, records: KeywordReviewRecord[], partial = false) {
  const workbook = partial || parsed.preserveSourceLayout || parsed.hasFormulas ? buildReviewedWorkbook(parsed, records) : buildMergedReviewedWorkbook(parsed, records);
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const base = parsed.fileName.replace(/\.(xlsx|xls|csv)$/i, '') || '关键词表';
  const fileName = `${base}_${parsed.mode === 'video' ? '视频' : '图文'}_${partial ? '审核进度' : '已审核'}.xlsx`;
  await saveToDownloadDir(fileName, blob);
  return fileName;
}
