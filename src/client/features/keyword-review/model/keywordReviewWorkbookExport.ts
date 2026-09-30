import * as XLSX from 'xlsx';
import type { KeywordReviewRecord, OutputColumn, OutputColumnKind, ParsedKeywordWorkbook } from './keywordReviewWorkbookTypes';
import { remapSheet, trimWorkbookRanges } from './keywordReviewSheetLayout';
import { writeWorkbookProgress } from './keywordReviewWorkbookState';

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
    SheetNames: [...parsed.workbook.SheetNames],
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
      if (record.sheetName !== meta.name) continue;
      const row = record.rowNumber - 1;
      const styleSource = sheet[XLSX.utils.encode_cell({ r: row, c: Math.max(0, categoryCol - 1) })];
      if (record.status !== 'done' || !record.category || !record.producible) {
        if (parsed.reviewModeMismatch) {
          for (const col of [categoryCol, categoryReasonCol, producibleCol, rejectReasonCol, lowValueCol]) {
            if (col >= 0) writeCell(sheet, row, col, '', styleSource);
          }
        }
        continue;
      }
      writeCell(sheet, row, categoryCol, record.category, styleSource);
      writeCell(sheet, row, categoryReasonCol, record.categoryReason || '', styleSource);
      writeCell(sheet, row, producibleCol, record.producible, styleSource);
      writeCell(sheet, row, rejectReasonCol, record.producible === '制作' ? '' : (record.rejectReason || ''), styleSource);
      if (lowValueCol >= 0) writeCell(sheet, row, lowValueCol, record.lowValue || '', styleSource);
    }
    workbook.Sheets[meta.name] = sheet;
  }
  trimWorkbookRanges(workbook);
  writeWorkbookProgress(workbook, records, parsed.mode);
  return workbook;
}

