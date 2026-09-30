const MB = 1024 * 1024;

/** Download limits are independent from the small thumbnail/image proxy limit. */
export const EXPORT_ZIP_LIMITS = {
  imageBytes: 25 * MB,
  audioBytes: 100 * MB,
  videoBytes: 200 * MB,
  inlineBytes: 25 * MB,
  totalMediaBytes: 512 * MB,
  maxArchiveBytes: 520 * MB,
  requestBytes: 36 * MB,
  maxMediaItems: 500,
  downloadConcurrency: 2,
  maxDownloadConcurrency: 4,
} as const;

export function getExportMediaByteLimit(contentType: string, url: string, filename = ''): number {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime.startsWith('video/')) return EXPORT_ZIP_LIMITS.videoBytes;
  if (mime.startsWith('audio/')) return EXPORT_ZIP_LIMITS.audioBytes;
  if (mime && mime !== 'application/octet-stream') return EXPORT_ZIP_LIMITS.imageBytes;
  const mediaPath = `${url.split(/[?#]/)[0]} ${filename}`;
  if (/\.(?:mp4|webm|mov|m4v|avi|mkv)(?:\s|$)/i.test(mediaPath)) return EXPORT_ZIP_LIMITS.videoBytes;
  if (/\.(?:mp3|wav|ogg|flac|m4a|aac)(?:\s|$)/i.test(mediaPath)) return EXPORT_ZIP_LIMITS.audioBytes;
  return EXPORT_ZIP_LIMITS.imageBytes;
}
