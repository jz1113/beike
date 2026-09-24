import * as XLSX from 'xlsx';
import type { OutputColumn } from './keywordReviewWorkbookTypes';

function cellText(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell || cell.v === undefined || cell.v === null) return '';
  return String(cell.w ?? cell.v).replace(/\s+/g, ' ').trim();
}

export function emptyDataColumns(sheet: XLSX.WorkSheet, headerRow: number, range: XLSX.Range): Set<number> {
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

export function remapSheet(sheet: XLSX.WorkSheet, outputColumns: OutputColumn[], range: XLSX.Range): XLSX.WorkSheet {
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
