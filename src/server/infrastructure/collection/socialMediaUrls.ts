/** Preserve signed URLs exactly; classify the pathname rather than its query values. */
export function socialRemoteUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/^\/\//, 'https://');
  try {
    const url = new URL(normalized);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? normalized : '';
  } catch { return ''; }
}

export function socialImageUrl(value: unknown): string {
  const url = socialRemoteUrl(value);
  return url && !/\.(?:mp4|mov|m4v|webm|avi|flv|m3u8|html?)(?:[/!]|$)/i.test(new URL(url).pathname) ? url : '';
}

export function socialVideoUrl(value: unknown): string | null {
  const url = socialRemoteUrl(value);
  return url && !/\.(?:jpg|jpeg|png|webp|gif|bmp|avif|html?)(?:[/!]|$)/i.test(new URL(url).pathname) ? url : null;
}

