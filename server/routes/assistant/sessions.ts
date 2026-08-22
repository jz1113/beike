import { jsonResponse } from '../../adapters/http';
import { prisma } from '@/lib/prisma';
import { formatUserError } from '../../lib/formatApiError';

function sanitizeAttachment(a: any) {
  if (!a || typeof a !== 'object') return null;
  const type = a.type === 'video' || a.type === 'document' ? a.type : 'image';
  const persistableUrl = (u?: string) => {
    if (!u || typeof u !== 'string') return undefined;
    if (u.startsWith('data:') || u.startsWith('blob:')) return undefined;
    return u;
  };
  if (type === 'document') {
    const text = typeof a.extractedText === 'string' ? a.extractedText.slice(0, 80000) : undefined;
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
    name: typeof a.name === 'string' ? a.name : undefined,
    size: typeof a.size === 'number' ? a.size : undefined,
  };
}

function sanitizeMessages(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-100).map((m) => ({
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
  };
}

/**
 * GET /api/assistant/sessions
 */
export async function GET() {
  try {
    const threads = await prisma.assistantThread.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    const sessions = threads.map((t) => {
      let messages: any[] = [];
      try {
        messages = JSON.parse(t.messagesJson || '[]');
      } catch {
        messages = [];
      }
      return {
        id: t.id,
        title: t.title,
        createdAt: t.createdAt.getTime(),
        updatedAt: t.updatedAt.getTime(),
        messages: Array.isArray(messages) ? messages : [],
      };
    });

    return jsonResponse({ success: true, sessions });
  } catch (error: any) {
    return jsonResponse({ success: false, error: formatUserError(error) }, 500);
  }
}

/**
 * PUT /api/assistant/sessions
 * body: { sessions: AssistantSession[], currentId?: string }
 * 全量 upsert 客户端快照（权威落库）
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const rawSessions = Array.isArray(body?.sessions) ? body.sessions : [];
    const sessions = rawSessions.slice(0, 40).map(sanitizeSession).filter((s: any) => s.id);

    if (sessions.length === 0) {
      return jsonResponse({ success: false, error: 'sessions 不能为空' }, 400);
    }

    // 仅有空默认会话且标题为「新对话」且无消息时，不覆盖库中已有非空数据
    const onlyEmptyDefault =
      sessions.length === 1 &&
      sessions[0].title === '新对话' &&
      (!sessions[0].messages || sessions[0].messages.length === 0);

    if (onlyEmptyDefault) {
      const existingCount = await prisma.assistantThread.count();
      if (existingCount > 0) {
        const existing = await prisma.assistantThread.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 50,
        });
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

    await prisma.$transaction(async (tx) => {
      for (const s of sessions) {
        await tx.assistantThread.upsert({
          where: { id: s.id },
          create: {
            id: s.id,
            title: s.title,
            messagesJson: JSON.stringify(s.messages || []),
            createdAt: new Date(s.createdAt || Date.now()),
            updatedAt: new Date(s.updatedAt || Date.now()),
          },
          update: {
            title: s.title,
            messagesJson: JSON.stringify(s.messages || []),
            updatedAt: new Date(s.updatedAt || Date.now()),
          },
        });
      }
      // 不再按客户端快照删除未列出的线程；删除仅通过 DELETE ?id= 显式进行
    });

    return jsonResponse({
      success: true,
      count: sessions.length,
      currentId: body?.currentId || null,
    });
  } catch (error: any) {
    return jsonResponse({ success: false, error: formatUserError(error) }, 500);
  }
}

/**
 * DELETE /api/assistant/sessions?id=...
 */
export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) {
      return jsonResponse({ success: false, error: '缺少 id' }, 400);
    }
    await prisma.assistantThread.delete({ where: { id } }).catch(() => null);
    return jsonResponse({ success: true });
  } catch (error: any) {
    return jsonResponse({ success: false, error: formatUserError(error) }, 500);
  }
}
