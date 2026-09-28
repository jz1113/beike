import { assistantMemory } from '../../services/assistant/assistantMemory';
import { readJsonBody } from '../../core/validate';
import { jsonResponse } from '../../core/http';

export async function memoryRoute(req: Request, threadId: string) {
  if (!threadId || threadId.length > 256) return jsonResponse({ success: false, error: '会话标识无效' }, 400);
  try {
    if (req.method === 'GET') return jsonResponse({ success: true, memory: await assistantMemory.get(threadId) });
    const body = await readJsonBody(req);
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean' || body.clear !== undefined && typeof body.clear !== 'boolean') {
      return jsonResponse({ success: false, error: '记忆设置格式无效' }, 400);
    }
    return jsonResponse({ success: true, memory: await assistantMemory.configure(threadId, { enabled: body.enabled, clear: body.clear }) });
  } catch { return jsonResponse({ success: false, error: '无法读取或保存会话记忆' }, 500); }
}
