export function blobExtFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'jpg';
}

export function sanitizeShotTitle(title: string, fallback: string): string {
  return (title || fallback).replace(/[\\/:*?"<>|]/g, '_');
}

/** 轮询时仅吞网络/解析类瞬时错误；业务 FAILURE 必须立刻抛出 */
export function isTransientPollError(err: unknown): boolean {
  if (!err) return true;
  if (err instanceof Error && err.name === 'ImageGenBusinessError') return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /(failed to fetch|networkerror|network request failed|load failed|econnreset|econnrefused|enotfound|etimedout|eai_again|socket hang up|aborted|unexpected end of json|unexpected token)/i.test(
    msg
  );
}

export function imageGenBusinessError(message: string): Error {
  const err = new Error(message);
  err.name = 'ImageGenBusinessError';
  return Object.assign(err, { retryable: false });
}

export function nonRetryableError(message: string): Error {
  return Object.assign(new Error(message), { retryable: false });
}
