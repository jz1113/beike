import * as XLSX from 'xlsx';
import type { OutputColumn } from './keywordReviewWorkbookTypes';

export function cellText(sheet: XLSX.WorkSheet, row: number, col: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  if (!cell || cell.v === undefined || cell.v === null) return '';
  return String(cell.w ?? cell.v);
}

export function emptyDataColumns(sheet: XLSX.WorkSheet, headerRow: number, range: XLSX.Range): Set<number> {
  const populated = new Set<number>();
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!') || !String(cell?.w ?? cell?.v ?? '').trim()) continue;
    const { r, c } = XLSX.utils.decode_cell(address);
    if (r > headerRow && r <= range.e.r && c >= range.s.c && c <= range.e.c) populated.add(c);
  }
  return new Set(Array.from({ length: range.e.c - range.s.c + 1 }, (_, col) => col + range.s.c).filter((col) => !populated.has(col)));
}

function meaningfulCell(cell: XLSX.CellObject | undefined): boolean {
  return Boolean(cell && (String(cell.w ?? cell.v ?? '').trim() || cell.f || cell.F || cell.l || cell.c));
}

export function sheetHasData(sheet: XLSX.WorkSheet): boolean {
  return Object.entries(sheet).some(([address, cell]) => !address.startsWith('!') && meaningfulCell(cell));
}

/** Excel can retain a million-row used range after its data is deleted. Work from stored values instead. */
export function effectiveSheetRange(sheet: XLSX.WorkSheet): XLSX.Range | null {
  let range: XLSX.Range | null = null;
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!') || !meaningfulCell(cell)) continue;
    const { r, c } = XLSX.utils.decode_cell(address);
    if (!range) range = { s: { r, c }, e: { r, c } };
    else {
      range.s.r = Math.min(range.s.r, r);
      range.s.c = Math.min(range.s.c, c);
      range.e.r = Math.max(range.e.r, r);
      range.e.c = Math.max(range.e.c, c);
    }
  }
  return range;
}

export function trimWorkbookRanges(workbook: XLSX.WorkBook): void {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const range = effectiveSheetRange(sheet);
    workbook.Sheets[name] = { ...sheet, '!ref': range ? XLSX.utils.encode_range(range) : 'A1' };
  }
}

export function dataRows(sheet: XLSX.WorkSheet, col: number, afterRow: number): number[] {
  return Object.entries(sheet).flatMap(([address, cell]) => {
    if (address.startsWith('!') || !String(cell?.w ?? cell?.v ?? '').trim()) return [];
    const position = XLSX.utils.decode_cell(address);
    return position.c === col && position.r > afterRow ? [position.r] : [];
  }).sort((a, b) => a - b);
}

export function hasInternalLinks(sheet: XLSX.WorkSheet): boolean {
  return Object.entries(sheet).some(([address, cell]) => !address.startsWith('!') && cell?.l?.Target?.startsWith('#'));
}

export function formulaColumns(sheet: XLSX.WorkSheet): Set<number> {
  const columns = new Set<number>();
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith('!') && (cell?.f || cell?.F)) columns.add(XLSX.utils.decode_cell(address).c);
  }
  return columns;
}

export function preserveColumnOrder(source: OutputColumn[], review: OutputColumn[], firstCol: number): OutputColumn[] {
  const leading = Array.from({ length: firstCol }, (_, col): OutputColumn => ({
    key: `source:unlabeled:${col}`, label: `列${col + 1}`, kind: 'source', sourceCol: col,
  }));
  const existing = [...leading, ...source, ...review.filter((column) => column.sourceCol !== undefined)]
    .sort((a, b) => (a.sourceCol ?? 0) - (b.sourceCol ?? 0));
  return [...existing, ...review.filter((column) => column.sourceCol === undefined)];
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
  const next: XLSX.WorkSheet = Object.fromEntries(Object.entries(sheet).filter(([key]) => key.startsWith('!')));
  const oldCols = sheet['!cols'] || [];
  const newCols: XLSX.ColInfo[] = [];
  const colMap = new Map<number, number>();

  for (let newCol = 0; newCol < outputColumns.length; newCol += 1) {
    const column = outputColumns[newCol];
    const inherited = column.sourceCol !== undefined ? oldCols[column.sourceCol] : undefined;
    newCols[newCol] = inherited ? { ...inherited } : { wch: defaultWidth(column) };
    if (column.sourceCol === undefined) continue;
    colMap.set(column.sourceCol, newCol);
  }
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith('!')) continue;
    const position = XLSX.utils.decode_cell(address);
    const targetCol = colMap.get(position.c);
    if (targetCol === undefined || position.r < range.s.r || position.r > range.e.r) continue;
    const from = cloneCell(cell);
    if (from) next[XLSX.utils.encode_cell({ r: position.r, c: targetCol })] = from;
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
