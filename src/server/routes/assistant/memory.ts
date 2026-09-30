import { assistantMemory } from '../../services/assistant/assistantMemory';
import { jsonResponse } from '../../core/http';
import { isAssistantThreadDeleted, withAssistantThreadWrite } from '@server/repositories/assistantThreadLifecycle';
import { readResponseBodyLimited } from '../../core/readBodyLimited';

export async function memoryRoute(req: Request, threadId: string) {
  if (!threadId || threadId.length > 256) return jsonResponse({ success: false, error: '会话标识无效' }, 400);
  try {
    let body: unknown;
    if (req.method !== 'GET') {
      const read = await readResponseBodyLimited(new Response(req.body, { headers: req.headers }), 4096, req.signal);
      if (!read.ok) return jsonResponse({ success: false, error: '记忆设置内容过大或为空' }, read.reason === 'too_large' ? 413 : 400);
      try { body = JSON.parse(read.buffer.toString('utf8')); }
      catch { return jsonResponse({ success: false, error: '无效 JSON' }, 400); }
    }
    return await withAssistantThreadWrite(threadId, async () => {
      if (await isAssistantThreadDeleted(threadId)) return jsonResponse({ success: false, error: '会话已删除' }, 404);
      if (req.method === 'GET') return jsonResponse({ success: true, memory: await assistantMemory.get(threadId) });
      if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonResponse({ success: false, error: '记忆设置格式无效' }, 400);
      const options = body as { enabled?: unknown; clear?: unknown };
      if (options.enabled !== undefined && typeof options.enabled !== 'boolean' || options.clear !== undefined && typeof options.clear !== 'boolean') {
        return jsonResponse({ success: false, error: '记忆设置格式无效' }, 400);
      }
      return jsonResponse({ success: true, memory: await assistantMemory.configure(threadId, { enabled: options.enabled as boolean | undefined, clear: options.clear as boolean | undefined }) });
    });
  } catch { return jsonResponse({ success: false, error: '无法读取或保存会话记忆' }, 500); }
}
