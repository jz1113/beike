import { utils } from 'xlsx';

export const MAX_POSTER_IMPORT_ROWS = 2000;
const MAX_POSTER_IMPORT_COLUMNS = 128;
const MAX_POSTER_PASTE_BYTES = 2 * 1024 * 1024;

/** Reject oversized input as a whole; never silently discard imported rows. */
export function assertPosterPasteSize(text: string): void {
  if (text.length > MAX_POSTER_PASTE_BYTES || new TextEncoder().encode(text).byteLength > MAX_POSTER_PASTE_BYTES) {
    throw new Error('粘贴内容超过 2MB，请拆分后导入');
  }
}

export function assertPosterSheetImportRange(sheet: { '!ref'?: string; '!fullref'?: string }): void {
  // sheetRows can limit parsing work, but !fullref still reveals truncation.
  const reference = sheet['!fullref'] || sheet['!ref'];
  if (!reference) return;
  if (reference.length > 64 || !/^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/.test(reference)) {
    throw new Error('工作表范围无效，请重新保存表格后导入');
  }
  const { s, e } = utils.decode_range(reference);
  const rows = e.r - s.r + 1;
  const columns = e.c - s.c + 1;
  if (![s.r, s.c, e.r, e.c, rows, columns].every(Number.isSafeInteger) || s.r < 0 || s.c < 0 || rows <= 0 || columns <= 0) {
    throw new Error('工作表范围无效，请重新保存表格后导入');
  }
  if (rows > MAX_POSTER_IMPORT_ROWS + 1) throw new Error(`每次最多导入 ${MAX_POSTER_IMPORT_ROWS} 条，请删除远处空白格式或拆分工作表后导入`);
  if (columns > MAX_POSTER_IMPORT_COLUMNS) throw new Error(`工作表范围超过 ${MAX_POSTER_IMPORT_COLUMNS} 列，请保留图片链接、原标题、文字方向和商品名称等必要列后导入`);
}

export function assertPosterImportRowCount(rowCount: number): void {
  if (rowCount > MAX_POSTER_IMPORT_ROWS) throw new Error(`每次最多导入 ${MAX_POSTER_IMPORT_ROWS} 条，请拆分后导入；本次未截断任何行`);
}
