import { readJsonBody, safeErrorMessage } from '@server/core/validate';
import { resolveShortUrlRedirect } from '@server/infrastructure/collection/apiaScraper';
import { mapWithConcurrency } from '@shared/domain/core/asyncPool';
import { xhsSourceKey } from '@shared/domain/collection/xhsSource';
import { jsonResponse } from '@server/core/http';
import { findImportSource, findDuplicateSourceAlbumGroups } from '@server/repositories/importSources';

export async function POST(req: Request) {
  const body = await readJsonBody(req, null) as { urls?: unknown } | null;
  if (!Array.isArray(body?.urls) || body.urls.length > 200 || body.urls.some((url: unknown) => typeof url !== 'string' || url.length > 8000)) return jsonResponse({ error: '每次最多查重 200 条链接' }, 400);
  const results: Array<{ url: string; resolvedUrl?: string; sourceKey?: string; state: string; albumName?: string; albumId?: string | null; reason?: string }> = [];
  await mapWithConcurrency(body.urls as string[], 4, async url => {
    let resolvedUrl = url;
    try {
      if (!xhsSourceKey(url)) {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || (parsed.hostname !== 'xhslink.com' && !parsed.hostname.endsWith('.xhslink.com'))) throw new Error('只支持小红书笔记链接');
        resolvedUrl = await resolveShortUrlRedirect(url);
      }
      const key = xhsSourceKey(resolvedUrl);
      if (!key) throw new Error('短链接未能识别笔记，请复制笔记的完整链接后重试');
      const existing = await findImportSource(key);
      results.push({ url, resolvedUrl, sourceKey: key, state: existing?.state || 'new', albumName: existing?.albumName, albumId: existing?.albumId });
    } catch (error) { results.push({ url, state: 'error', reason: safeErrorMessage(error, '查重失败') }); }
  });
  return jsonResponse({ success: true, data: results });
}

/** Historical data: exact-image candidate groups for manual review only. */
export async function GET() {
  return jsonResponse({ success: true, data: await findDuplicateSourceAlbumGroups() });
}
