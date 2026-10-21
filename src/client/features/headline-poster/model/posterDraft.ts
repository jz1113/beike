import { utils } from 'xlsx';
import { COVER_FORMATS } from './coverFormat';
import {
  makeId,
  posterInputError,
  POSTER_PRODUCTION_SETTINGS_KEY,
  normalizeConcurrency,
  normalizeTitleHandling,
  type PosterItem,
  type PosterProductionSettings,
} from './posterTypes';

/**
 * Keeps every valid parsed record when a user imports one or more batches.
 * Generation concurrency is configured separately and must not discard rows.
 */
export function mergePosterItems(existing: PosterItem[], imported: PosterItem[]): PosterItem[] {
  return [...existing, ...imported];
}

export interface PosterInputDraft {
  pasteText: string;
  importMode: 'file' | 'paste';
}

const EMPTY_DRAFT: PosterInputDraft = { pasteText: '', importMode: 'paste' };

function draftKey(scope: string): string {
  if (!/^[a-f0-9]{64}$/.test(scope)) throw new Error('大字报工作区标识无效');
  return `headline_poster_input_draft_v1:${scope}`;
}

/** Input drafts belong to this browser tab and never replace saved batches. */
export function loadPosterInputDraft(scope: string): PosterInputDraft {
  const raw = window.sessionStorage.getItem(draftKey(scope));
  if (!raw) return { ...EMPTY_DRAFT };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('输入草稿格式无效');
  const draft = value as Partial<PosterInputDraft>;
  if (typeof draft.pasteText !== 'string' || (draft.importMode !== 'file' && draft.importMode !== 'paste')) {
    throw new Error('输入草稿格式无效');
  }
  return { pasteText: draft.pasteText, importMode: draft.importMode };
}

export function persistPosterInputDraft(scope: string, draft: PosterInputDraft): void {
  window.sessionStorage.setItem(draftKey(scope), JSON.stringify(draft));
}


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


const COPY_SUFFIX = /(?:\s*[(（]\d+[)）]|[-_ ]+(?:副本|copy))+$/iu;

/** The image file name is the original title. Drop the extension and trailing copy markers. */
export function titleFromImageFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.replace(/\.[^.]+$/u, '') ?? '';
  let title = base.trim();
  let next = title.replace(COPY_SUFFIX, '').trim();
  while (next !== title) {
    title = next;
    next = title.replace(COPY_SUFFIX, '').trim();
  }
  return title;
}

export function isPosterImageFile(fileName: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(fileName);
}

export function isPosterTableFile(fileName: string): boolean {
  return /\.(xlsx|xls|csv)$/i.test(fileName);
}

export function posterItemFromUploadedImage(url: string, fileName: string): PosterItem {
  const originalTitle = titleFromImageFileName(fileName);
  const importError = posterInputError({ sourceImageUrl: url, originalTitle, productName: '' });
  return {
    id: makeId(),
    sourceImageUrl: url,
    originalTitle,
    productName: '',
    format: COVER_FORMATS.portrait,
    coverTitle: originalTitle,
    status: importError ? 'failed' : 'idle',
    importError,
    error: importError,
  };
}

export function normalizePosterProductionSettings(value: unknown): Partial<PosterProductionSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const parsed = value as Partial<PosterProductionSettings>;
  return {
    imageModel: typeof parsed.imageModel === 'string' ? parsed.imageModel.trim() || undefined : undefined,
    titleModel: typeof parsed.titleModel === 'string' ? parsed.titleModel.trim() || undefined : undefined,
    titleHandling: normalizeTitleHandling(parsed.titleHandling),
    imageQuality: parsed.imageQuality === 'high' || parsed.imageQuality === 'medium' || parsed.imageQuality === 'low' ? parsed.imageQuality : undefined,
    concurrency: normalizeConcurrency(parsed.concurrency),
    memorySampleId: typeof parsed.memorySampleId === 'string' ? parsed.memorySampleId.trim().slice(0, 128) : '',
  };
}

export function loadPosterProductionSettings(): Partial<PosterProductionSettings> {
  try {
    const raw = window.localStorage.getItem(POSTER_PRODUCTION_SETTINGS_KEY);
    if (!raw) return {};
    return normalizePosterProductionSettings(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function persistPosterProductionSettings(next: PosterProductionSettings): boolean {
  try {
    window.localStorage.setItem(POSTER_PRODUCTION_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  // A failed compatibility write does not undo the successfully saved settings.
  try { window.localStorage.setItem('ai_image_gen_model', next.imageModel); } catch { /* optional compatibility setting */ }
  return true;
}

export const MIN_COVER_FILE_BYTES = 200 * 1024 + 1;
export const MAX_COVER_FILE_BYTES = 5 * 1024 * 1024 - 1;

/**
 * A clean colour-field cover can be far below a platform's minimum file size
 * even at maximum JPEG quality. Add legal JPEG COM segments in that rare
 * case, preserving every rendered pixel instead of adding visual noise.
 */
export async function enforceCoverJpegFileSize(blob: Blob): Promise<Blob> {
  const signature = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (signature.length < 2 || signature[0] !== 0xff || signature[1] !== 0xd8) {
    throw new Error('导出文件不是有效 JPEG，无法校验封面体积');
  }
  if (blob.size >= MIN_COVER_FILE_BYTES && blob.size <= MAX_COVER_FILE_BYTES) return blob;
  if (blob.size > MAX_COVER_FILE_BYTES) {
    throw new Error('封面无法压缩到严格小于 5MB，请降低图片质量后重试');
  }

  const source = new Uint8Array(await blob.arrayBuffer());
  let remaining = MIN_COVER_FILE_BYTES - blob.size;
  const segments: ArrayBuffer[] = [];
  while (remaining > 0) {
    // JPEG COM length includes the two-byte length field, so payload must be
    // at most 65,533 bytes. Every segment adds payload + 4 bytes.
    const payloadLength = Math.min(65_533, Math.max(1, remaining - 4));
    const segment = new Uint8Array(new ArrayBuffer(payloadLength + 4));
    segment[0] = 0xff;
    segment[1] = 0xfe;
    const encodedLength = payloadLength + 2;
    segment[2] = encodedLength >> 8;
    segment[3] = encodedLength & 0xff;
    segments.push(segment.buffer);
    remaining -= segment.length;
  }

  const prefix = source.buffer.slice(source.byteOffset, source.byteOffset + 2);
  const suffix = source.buffer.slice(source.byteOffset + 2);
  return new Blob([prefix, ...segments, suffix], { type: 'image/jpeg' });
}
