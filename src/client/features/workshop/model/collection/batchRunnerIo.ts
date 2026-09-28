export function blobExtFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'jpg';
}

export function sanitizeShotTitle(title: string, fallback: string): string {
  return (title || fallback).replace(/[\\/:*?"<>|]/g, '_');
}

export {
  isTransientPollError,
  imageGenBusinessError,
  nonRetryableError,
} from '@client/shared/api/generationErrors';

