import { jsonResponse } from '../../adapters/http';

const isDevLogEnabled =
  process.env.NODE_ENV !== 'production' && process.env.DESKTOP_SHELL === '1';

/**
 * POST /api/system/dev-log
 * 桌面 dev：将 WebView console 转发到 API 终端
 */
export async function POST(req: Request) {
  if (!isDevLogEnabled) {
    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.entries) || body.entries.length === 0) {
      return jsonResponse({ success: true });
    }

    for (const entry of body.entries) {
      const level = typeof entry.level === 'string' ? entry.level : 'log';
      const message = typeof entry.message === 'string' ? entry.message : String(entry.message ?? '');
      const prefix = `[UI:${level}]`;
      if (level === 'error') console.error(prefix, message);
      else if (level === 'warn') console.warn(prefix, message);
      else console.log(prefix, message);
    }

    return jsonResponse({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'dev-log failed';
    return jsonResponse({ success: false, error: msg }, 500);
  }
}
