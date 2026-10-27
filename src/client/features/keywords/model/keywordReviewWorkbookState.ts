import * as XLSX from 'xlsx';
import type { KeywordReviewMode } from '@shared/contracts/generate';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';
import { dataRows } from './keywordReviewSheetLayout';

const STATE_MARKER = 'beike.keyword-review.progress.v2';
const LEGACY_STATE_MARKER = 'beike.keyword-review.progress.v1';
const STATE_SHEET_NAME = '__关键词审核进度';
const UNCERTAIN_ERROR = '本行提交结果待核对，不会自动重新收费';

export function isProgressStateSheet(sheet: XLSX.WorkSheet | undefined): boolean {
  return (sheet?.A1?.v === STATE_MARKER || sheet?.A1?.v === LEGACY_STATE_MARKER) && (sheet.B1?.v === 'image' || sheet.B1?.v === 'video');
}

export function workbookReviewMode(workbook: XLSX.WorkBook): KeywordReviewMode | undefined {
  const sheet = workbook.SheetNames.map((name) => workbook.Sheets[name]).find(isProgressStateSheet);
  return sheet?.B1.v as KeywordReviewMode | undefined;
}

function inputSignature(record: KeywordReviewRecord): string {
  return JSON.stringify([record.query, record.expansion || '', record.entityExpansion || '', record.contentType || '']);
}

/** Restore only an exact source-row match, so edited or unrelated rows cannot inherit a charge quarantine. */
export function restoreWorkbookProgress(workbook: XLSX.WorkBook, records: KeywordReviewRecord[], mode: KeywordReviewMode): void {
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet || !isProgressStateSheet(sheet) || sheet.B1.v !== mode || !sheet['!ref']) continue;
    for (const row of dataRows(sheet, 0, 1)) {
      const value = (col: number) => sheet[XLSX.utils.encode_cell({ r: row, c: col })]?.v;
      const sheetName = value(0);
      const rowNumber = value(1);
      const query = value(2);
      if (typeof sheetName !== 'string' || typeof rowNumber !== 'number' || !Number.isSafeInteger(rowNumber)
        || typeof query !== 'string' || value(3) !== '是') continue;
      const record = byId.get(`${sheetName}:${rowNumber}`);
      if (!record || record.query !== query) continue;
      if (sheet.A1.v === STATE_MARKER && value(5) !== inputSignature(record)) continue;
      // A valid verdict can be filled in after exporting an uncertain request.
      if (record.status === 'done') continue;
      // Older exports did not save contextual inputs. Keep their unknown charges quarantined conservatively.
      record.status = 'error';
      record.submissionUncertain = true;
      record.error = typeof value(4) === 'string' && value(4) ? String(value(4)) : UNCERTAIN_ERROR;
    }
  }
}

export function writeWorkbookProgress(workbook: XLSX.WorkBook, records: KeywordReviewRecord[], mode: KeywordReviewMode): void {
  const previousNames = [...workbook.SheetNames];
  const originalMeta = workbook.Workbook?.Sheets || [];
  const sheetMeta = new Map(previousNames.map((name, index) => [name, originalMeta[index]]));
  workbook.SheetNames = previousNames.filter((name) => {
    if (!isProgressStateSheet(workbook.Sheets[name])) return true;
    delete workbook.Sheets[name];
    return false;
  });

  const uncertain = records.filter((record) => record.submissionUncertain && record.status !== 'done');
  let name = STATE_SHEET_NAME;
  let suffix = 2;
  while (workbook.Sheets[name]) name = `${STATE_SHEET_NAME}_${suffix++}`;
  workbook.Sheets[name] = XLSX.utils.aoa_to_sheet([
    [STATE_MARKER, mode],
    ['sheetName', 'rowNumber', 'query', 'submissionUncertain', 'error', 'inputSignature'],
    ...uncertain.map((record) => [record.sheetName, record.rowNumber, record.query, '是', (record.error || UNCERTAIN_ERROR).slice(0, 2000), inputSignature(record)]),
  ]);
  workbook.SheetNames.push(name);
  sheetMeta.set(name, { name, Hidden: 1 });
  workbook.Workbook = {
    ...workbook.Workbook,
    Sheets: workbook.SheetNames.map((name) => ({ ...sheetMeta.get(name), name })),
  };
}
