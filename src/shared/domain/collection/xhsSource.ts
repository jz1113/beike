/** Stable identity without access tokens. Only official note URL paths are accepted. */
export function xhsSourceKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.hostname !== 'xiaohongshu.com' && !url.hostname.endsWith('.xiaohongshu.com')) return null;
    const match = /^\/(?:explore|discovery\/item)\/([a-f0-9]{24})(?:\/|$)/i.exec(url.pathname);
    return match ? `xhs:${match[1].toLowerCase()}` : null;
  } catch { return null; }
}
