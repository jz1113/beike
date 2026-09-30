import { assistantMemory } from '../../services/assistant/assistantMemory';
import { jsonResponse } from '../../core/http';
import { assistantSessionRepository } from '@server/repositories/assistantSessions';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { readResponseBodyLimited } from '../../core/readBodyLimited';
import { safeErrorMessage, parseJsonBody } from '../../core/validate';
import { assistantMessageSchema } from '@shared/contracts/assistant';
import { z } from 'zod';
import { interruptAssistantThreadTurns, stopAssistantThreadTurns } from '../../services/assistant/assistantTurnStream';
import { clearSessionApprovals } from '../../services/assistant/assistantApprovalStore';
import { discardQueuedTurnItems } from '../../services/library/itemPersistQueue';

const sessionBodySchema = z.object({
  sessions: z.array(z.object({
    id: z.string().trim().min(1).max(255),
    title: z.string().max(500).optional(),
    createdAt: z.number().finite().min(0).max(8_640_000_000_000_000).optional(),
    updatedAt: z.number().finite().min(0).max(8_640_000_000_000_000).optional(),
    messages: z.array(assistantMessageSchema).max(2000).optional(),
    allowedTools: z.array(z.string().min(1).max(128)).max(50).optional(),
  })).min(1).max(50),
  currentId: z.string().max(255).nullish(),
});

function sanitizeAttachment(a: any) {
  if (!a || typeof a !== 'object') return null;
  const type = a.type === 'video' || a.type === 'document' ? a.type : 'image';
  const persistableUrl = (u?: string) => {
    if (!u || typeof u !== 'string') return undefined;
    if (u.startsWith('data:') || u.startsWith('blob:')) return undefined;
    return u;
  };
  if (type === 'document') {
    const text = typeof a.extractedText === 'string' ? a.extractedText.slice(0, 100000) : undefined;
    if (!text && !a.name) return null;
    return {
      type: 'document',
      name: typeof a.name === 'string' ? a.name : undefined,
      size: typeof a.size === 'number' ? a.size : undefined,
      mime: typeof a.mime === 'string' ? a.mime : undefined,
      extractedText: text,
      url: '',
    };
  }
  const url = persistableUrl(a.url);
  const thumbnailUrl = persistableUrl(a.thumbnailUrl);
  if (type === 'image' && !url) return null;
  if (type === 'video' && !url && !thumbnailUrl) return null;
  return {
    type,
    url: url || '',
    thumbnailUrl,
    mentionName: typeof a.mentionName === 'string' && /^图片\d+$/.test(a.mentionName) ? a.mentionName : undefined,
    name: typeof a.name === 'string' ? a.name : undefined,
    size: typeof a.size === 'number' ? a.size : undefined,
  };
}

function sanitizeMessages(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => ({
    ...m,
    attachments: Array.isArray(m.attachments)
      ? m.attachments.map(sanitizeAttachment).filter((a: any) => a && (a.url || (a.type === 'document' && a.extractedText) || a.type === 'video'))
      : undefined,
  }));
}

function sanitizeSession(s: any) {
  return {
    id: String(s.id),
    title: (s.title && String(s.title).trim()) || '新对话',
    createdAt: typeof s.createdAt === 'number' ? s.createdAt : new Date(s.createdAt || Date.now()).getTime(),
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : new Date(s.updatedAt || Date.now()).getTime(),
    messages: sanitizeMessages(s.messages || []),
    allowedTools: Array.isArray(s.allowedTools) ? [...new Set<string>(s.allowedTools)] : undefined,
  };
}

/**
 * GET /api/assistant/sessions
 */
export async function GET() {
  try {
    const threads = await assistantSessionRepository.list();

    const sessions = threads.map((t) => {
      let messages: any[] = [];
      let allowedTools: string[] | undefined;
      try {
        messages = JSON.parse(t.messagesJson || '[]');
      } catch {
        messages = [];
      }
      try {
        const stored = JSON.parse(t.allowedToolsJson || '[]');
        // Legacy [] meant no configured policy; v1 distinguishes an explicit deny-all list.
        if (Array.isArray(stored)) allowedTools = stored.length ? stored.filter((name): name is string => typeof name === 'string') : undefined;
        else if (stored?.version === 1 && Array.isArray(stored.tools)) allowedTools = stored.tools.filter((name: unknown): name is string => typeof name === 'string');
      } catch {
        allowedTools = undefined;
      }
      return {
        id: t.id,
        title: t.title,
        createdAt: t.createdAt.getTime(),
        updatedAt: t.updatedAt.getTime(),
        messages: Array.isArray(messages) ? messages : [],
        allowedTools,
      };
    });

    return jsonResponse({ success: true, sessions });
  } catch (error: any) {
    return jsonResponse({ success: false, error: safeErrorMessage(new Error(formatUserError(error)), '会话操作失败，请稍后重试') }, 500);
  }
}

/**
 * PUT /api/assistant/sessions
 * body: { sessions: AssistantSession[], currentId?: string }
 * 全量 upsert 客户端快照（权威落库）
 */
export async function PUT(req: Request) {
  try {
    let rawBody: unknown;
    try {
      const read = await readResponseBodyLimited(new Response(req.body, { headers: req.headers }), 64_000_000);
      if (!read.ok) return jsonResponse({ success: false, error: '会话内容过大或为空' }, read.reason === 'too_large' ? 413 : 400);
      rawBody = JSON.parse(read.buffer.toString('utf8'));
    } catch { return jsonResponse({ success: false, error: '无效 JSON' }, 400); }
    const parsed = parseJsonBody(rawBody, sessionBodySchema);
    if (!parsed.success) return jsonResponse({ success: false, error: parsed.error }, 400);
    const body = parsed.data;
    const sessions = body.sessions.map(sanitizeSession);

    if (sessions.length === 0) {
      return jsonResponse({ success: false, error: 'sessions 不能为空' }, 400);
    }

    // 仅有空默认会话且标题为「新对话」且无消息时，不覆盖库中已有非空数据
    const onlyEmptyDefault =
      sessions.length === 1 &&
      sessions[0].title === '新对话' &&
      (!sessions[0].messages || sessions[0].messages.length === 0);

    if (onlyEmptyDefault) {
      const existingCount = await assistantSessionRepository.count();
      if (existingCount > 0) {
        const existing = await assistantSessionRepository.list();
        const hasReal = existing.some((t) => {
          try {
            const msgs = JSON.parse(t.messagesJson || '[]');
            return Array.isArray(msgs) && msgs.length > 0;
          } catch {
            return false;
          }
        });
        if (hasReal) {
          return jsonResponse({
            success: true,
            skipped: true,
            reason: '拒绝用空默认会话覆盖已有对话',
          });
        }
      }
    }

    const savedCount = await assistantSessionRepository.save(sessions);

    return jsonResponse({
      success: true,
      count: savedCount,
      skippedCount: sessions.length - savedCount,
      currentId: body?.currentId || null,
    });
  } catch (error: any) {
    return jsonResponse({ success: false, error: safeErrorMessage(new Error(formatUserError(error)), '会话操作失败，请稍后重试') }, 500);
  }
}

/**
 * DELETE /api/assistant/sessions?id=...
 */
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id')?.trim();
    if (!id || id.length > 255) {
      return jsonResponse({ success: false, error: '缺少 id' }, 400);
    }
    // Commit the durable barrier before waiting for worker cleanup. Old clients and late
    // item writes cannot recreate this thread, even if cleanup must be retried.
    // Abort first so a running, abortable memory summarizer can release its write lock.
    const interruptedTurnIds = interruptAssistantThreadTurns(id);
    clearSessionApprovals(id);
    await assistantSessionRepository.markDeleted(id);
    const activeTurnIds = await stopAssistantThreadTurns(id);
    const turns = await assistantSessionRepository.turnIds(id);
    const turnIds = [...new Set([...interruptedTurnIds, ...activeTurnIds, ...turns.map(turn => turn.id)])];
    discardQueuedTurnItems(turnIds);
    await assistantSessionRepository.deleteTurnData(id, turnIds);
    await assistantMemory.remove(id);
    return jsonResponse({ success: true });
  } catch (error: any) {
    return jsonResponse({ success: false, error: safeErrorMessage(new Error(formatUserError(error)), '会话操作失败，请稍后重试') }, 500);
  }
}
