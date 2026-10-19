import { COVER_FORMATS } from './coverFormat';
import { makeId, posterInputError, type PosterItem } from './posterTypes';

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
