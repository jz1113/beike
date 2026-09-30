const mimeExtensions: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/avif': 'avif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4',
  'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg',
  'audio/flac': 'flac', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'application/pdf': 'pdf',
  'application/zip': 'zip', 'application/json': 'json', 'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
const knownExtension = /^(png|jpe?g|webp|gif|avif|svg|mp4|webm|mov|mp3|wav|ogg|flac|m4a|aac|pdf|docx|zip|json|txt)$/;

export function getMediaDownloadFilename(filename: string, mimeType: string, url: string): string {
  const sourceExtension = url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const extension = mimeExtensions[mimeType.split(';')[0].toLowerCase()] ||
    (sourceExtension && knownExtension.test(sourceExtension) ? sourceExtension : undefined);
  const existingExtension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (!extension) return existingExtension ? filename : `${filename}.bin`;
  if (existingExtension === extension || (extension === 'jpg' && existingExtension === 'jpeg')) return filename;
  return existingExtension ? filename.replace(/\.[a-z0-9]+$/i, `.${extension}`) : `${filename}.${extension}`;
}

export function guessMediaDownloadMime(url: string): string {
  const extension = url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return Object.entries(mimeExtensions).find(([, ext]) => ext === extension || (ext === 'jpg' && extension === 'jpeg'))?.[0] || 'application/octet-stream';
}

/** Reject common upstream error documents while permitting CDN binary MIME types. */
export function isMediaDownloadContent(mimeType: string, url: string, prefix: string): boolean {
  const mime = mimeType.split(';')[0].toLowerCase();
  const sourcePath = url.split(/[?#]/)[0];
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return false;
  if (mime === 'application/json' && !/\.json$/i.test(sourcePath)) return false;
  if (mime === 'text/plain' && !/\.txt$/i.test(sourcePath)) return false;
  if (mime === 'image/svg+xml' && !/\.svg$/i.test(sourcePath) && !url.startsWith('data:image/svg+xml')) return false;
  const clean = prefix.trimStart();
  if (/^(?:<!doctype\s+html|<html\b)/i.test(clean)) return false;
  if ((!mime || mime === 'application/octet-stream') &&
      (/^\{\s*"(?:error|message)"\s*:/.test(clean) || /^\{[^}]*"success"\s*:\s*false/.test(clean))) return false;
  return true;
}
