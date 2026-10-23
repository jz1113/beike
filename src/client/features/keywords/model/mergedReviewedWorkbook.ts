import * as XLSX from 'xlsx';
import type { KeywordReviewRecord, OutputColumn, ParsedKeywordWorkbook } from './keywordReviewWorkbookTypes';
import { writeWorkbookProgress } from './keywordReviewWorkbookState';
import { buildReviewedWorkbook } from './keywordReviewWorkbookExport';

function cloneCell(cell: XLSX.CellObject | undefined): XLSX.CellObject | undefined {
  if (!cell) return undefined;
  return { ...cell, s: cell.s ? { ...(cell.s as Record<string, unknown>) } : undefined };
}

function writeCell(sheet: XLSX.WorkSheet, row: number, col: number, value: string, styleSource?: XLSX.CellObject) {
  sheet[XLSX.utils.encode_cell({ r: row, c: col })] = { t: 's', v: value, s: cloneCell(styleSource)?.s };
}

function columnWidth(column: OutputColumn): number {
  if (column.kind === 'category') return 16;
  if (column.kind === 'categoryReason') return 28;
  if (column.kind === 'producible') return 14;
  if (column.kind === 'rejectReason') return 24;
  if (column.kind === 'lowValue') return 15;
  if (column.sourceKind === 'query') return 18;
  if (column.sourceKind === 'expansion' || column.sourceKind === 'entityExpansion') return 28;
  if (column.sourceKind === 'contentType') return 16;
  if (column.sourceKind === 'dispatchTime') return 18;
  return 12;
}

export function buildMergedReviewedWorkbook(parsed: ParsedKeywordWorkbook, records: KeywordReviewRecord[]): XLSX.WorkBook {
  if (parsed.preserveSourceLayout || parsed.hasFormulas) return buildReviewedWorkbook(parsed, records);
  const columns = parsed.displayColumns;
  const includeSourceSheet = parsed.sheets.length > 1;
  const offset = includeSourceSheet ? 1 : 0;
  const sheet: XLSX.WorkSheet = {};
  const first = parsed.sheets[0];
  const name = includeSourceSheet ? '审核结果' : first.name;
  const outputRecords: KeywordReviewRecord[] = [];
  const firstSource = parsed.workbook.Sheets[first.name];
  const headerStyle = firstSource?.[XLSX.utils.encode_cell({ r: first.headerRow, c: first.range.s.c })];
  const sheetByName = new Map(parsed.sheets.map((meta) => [meta.name, meta]));
  const columnBySheet = new Map(parsed.sheets.map((meta) => [
    meta.name,
    new Map(meta.outputColumns.filter((column) => column.kind === 'source').map((column) => [column.key, column.sourceCol])),
  ]));

  if (includeSourceSheet) writeCell(sheet, 0, 0, '来源工作表', headerStyle);
  for (let col = 0; col < columns.length; col += 1) {
    writeCell(sheet, 0, col + offset, columns[col].label, headerStyle);
  }

  let outputRow = 1;
  for (const record of records) {
    const meta = sheetByName.get(record.sheetName);
    const source = parsed.workbook.Sheets[record.sheetName];
    if (!meta || !source) continue;
    const sourceRow = record.rowNumber - 1;
    const styleSource = source[XLSX.utils.encode_cell({ r: sourceRow, c: meta.range.s.c })];
    if (includeSourceSheet) writeCell(sheet, outputRow, 0, record.sheetName, styleSource);
    for (let col = 0; col < columns.length; col += 1) {
      const column = columns[col];
      const targetCol = col + offset;
      if (column.kind === 'source') {
        const sourceCol = columnBySheet.get(record.sheetName)?.get(column.key);
        if (sourceCol === undefined) continue;
        const original = cloneCell(source[XLSX.utils.encode_cell({ r: sourceRow, c: sourceCol })]);
        if (original) sheet[XLSX.utils.encode_cell({ r: outputRow, c: targetCol })] = original;
      } else if (record.status === 'done' && record.category && record.producible) {
        const value = column.kind === 'category' ? record.category
          : column.kind === 'categoryReason' ? (record.categoryReason || '')
          : column.kind === 'producible' ? record.producible
          : column.kind === 'lowValue' ? (record.lowValue || '')
          : record.producible === '制作' ? '' : (record.rejectReason || '');
        writeCell(sheet, outputRow, targetCol, value, styleSource);
      }
    }
    outputRecords.push({ ...record, id: `${name}:${outputRow + 1}`, sheetName: name, rowNumber: outputRow + 1 });
    outputRow += 1;
  }

  const lastCol = columns.length - 1 + offset;
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: outputRow - 1, c: lastCol } });
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  sheet['!cols'] = [
    ...(includeSourceSheet ? [{ wch: 18 }] : []),
    ...columns.map((column) => {
      const sourceCol = first.outputColumns.find((candidate) => candidate.key === column.key)?.sourceCol;
      const inherited = sourceCol === undefined ? undefined : firstSource?.['!cols']?.[sourceCol];
      return inherited ? { ...inherited } : { wch: columnWidth(column) };
    }),
  ];

  const workbook: XLSX.WorkBook = {
    SheetNames: [name], Sheets: { [name]: sheet }, Props: parsed.workbook.Props,
    Workbook: { WBProps: parsed.workbook.Workbook?.WBProps },
  };
  writeWorkbookProgress(workbook, outputRecords, parsed.mode);
  return workbook;
}
