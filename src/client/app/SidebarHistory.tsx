import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, MessageSquare, MoreHorizontal, Pencil, Pin, SquarePen, Trash2, X } from 'lucide-react';
import { useAppStore, type ChatSession } from '@client/store';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

function usableMediaUrl(url?: string | null): url is string {
  return Boolean(url && !url.startsWith('agent-file:'));
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || url.startsWith('data:video/');
}

function displayMediaUrl(url: string) {
  const remote =
    url.includes('/azhuo/') &&
    (url.includes('.aliyuncs.com') || url.includes('.myqcloud.com') || url.includes('.r2.cloudflarestorage.com') || url.includes('.amazonaws.com'));
  if (!remote) return url;
  return proxyMediaUrl(url, { thumb: !isVideoUrl(url), asVideo: isVideoUrl(url), width: 96 });
}

function sessionThumbnail(session: ChatSession): string | null {
  for (const task of session.tasks || []) {
    if (task.mediaType === 'agent' || task.id.startsWith('agent-task-')) continue;
    const candidates = [task.resultUrl, task.referenceImageUrl, task.sourceImageUrl, ...(task.images || [])];
    const hit = candidates.find(usableMediaUrl);
    if (hit) return hit;
  }
  return null;
}

function ChatBubbleIcon() {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-black/[0.05] text-slate-600">
      <MessageSquare className="h-3.5 w-3.5 stroke-[1.8]" />
    </div>
  );
}

function SessionLeadingMark({ session }: { session: ChatSession }) {
  const [failed, setFailed] = useState(false);
  const thumbnail = sessionThumbnail(session);
  if (!thumbnail || failed) return <ChatBubbleIcon />;
  const src = displayMediaUrl(thumbnail);
  const box = 'h-6 w-6 shrink-0 rounded-[7px] border border-black/5 object-cover';
  if (isVideoUrl(thumbnail)) {
    return <video src={src} muted playsInline preload="metadata" className={box} onError={() => setFailed(true)} />;
  }
  return <img src={src} alt="" className={box} onError={() => setFailed(true)} />;
}

interface Props {
  currentView: string;
  onOpenSession: (id: string) => void;
  onCreateConversation: () => void;
}

export function SidebarHistory({
  currentView,
  onOpenSession,
  onCreateConversation,
}: Props) {
  const sessions = useAppStore((s) => s.sessions);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const renameSession = useAppStore((s) => s.renameSession);
  const pinSession = useAppStore((s) => s.pinSession);
  const deleteSession = useAppStore((s) => s.deleteSession);
  const [chatsOpen, setChatsOpen] = useState(true);
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const ordered = [...sessions].sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) || b.createdAt - a.createdAt);

  useEffect(() => {
    if (!menu && !deleteTarget) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null);
        setDeleteTarget(null);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu, deleteTarget]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const saveRename = (id: string) => {
    const title = editTitle.trim();
    if (title) renameSession(id, title);
    setEditingId(null);
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto px-1">
      <section>
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setChatsOpen((open) => !open)}
            className="flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            aria-expanded={chatsOpen}
          >
            对话
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${chatsOpen ? 'rotate-90' : ''}`} />
          </button>
          <button
            type="button"
            aria-label="新建对话"
            title="新建对话"
            onClick={onCreateConversation}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-950 transition-colors cursor-pointer"
          >
            <SquarePen className="h-4 w-4" />
          </button>
        </div>
        {chatsOpen && (
          <div className="mt-1.5 space-y-1">
            {ordered.length === 0 ? (
              <div className="px-2 py-3 text-[12px] text-slate-400 select-none">
                暂无历史对话
              </div>
            ) : (
              <div className="space-y-0.5">
                {ordered.map((session) => {
                    const active = currentView === 'generate' && session.id === currentSessionId;
                    const title = session.title || '新创作对话';
                    return (
                      <div
                        key={session.id}
                        className={`group flex items-center justify-between gap-1.5 rounded-xl px-2 py-1.5 transition-colors ${
                          active ? 'bg-[#ECEDEF] font-medium text-slate-950' : 'hover:bg-white text-slate-800'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenSession(session.id)}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
                          title={title}
                        >
                          <SessionLeadingMark session={session} />
                          {session.isPinned && (
                            <Pin className="h-3 w-3 shrink-0 text-amber-500 fill-amber-500 rotate-45" />
                          )}
                          {editingId === session.id ? (
                            <input
                              autoFocus
                              value={editTitle}
                              onChange={(event) => setEditTitle(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onBlur={() => saveRename(session.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') saveRename(session.id);
                                if (event.key === 'Escape') setEditingId(null);
                              }}
                              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[13px] text-slate-900 outline-none"
                            />
                          ) : (
                            <span className="truncate text-[13px] leading-5">{title}</span>
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`${title}更多操作`}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 hover:bg-slate-200/80 hover:text-slate-800 group-hover:opacity-100 transition-opacity cursor-pointer"
                          onClick={(event) => {
                            event.stopPropagation();
                            const rect = event.currentTarget.getBoundingClientRect();
                            setMenu({ id: session.id, top: rect.bottom + 4, left: rect.right - 132 });
                          }}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
            )}
          </div>
        )}
      </section>

      {menu && createPortal(
        <div className="fixed z-[70] w-32 rounded-xl border border-slate-100 bg-white p-1 text-[13px] shadow-lg" style={{ top: menu.top, left: menu.left }} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 cursor-pointer text-slate-700" onClick={() => { pinSession(menu.id); setMenu(null); }}>
            <Pin className="h-3.5 w-3.5" />置顶
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 cursor-pointer text-slate-700" onClick={() => {
            const session = sessions.find((item) => item.id === menu.id);
            setEditingId(menu.id);
            setEditTitle(session?.title || '');
            setMenu(null);
          }}>
            <Pencil className="h-3.5 w-3.5" />重命名
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-rose-50 hover:text-rose-600 cursor-pointer text-slate-700" onClick={() => {
            const session = sessions.find((item) => item.id === menu.id);
            setDeleteTarget({ id: menu.id, title: session?.title || '未命名对话' });
            setMenu(null);
          }}>
            <Trash2 className="h-3.5 w-3.5" />删除
          </button>
        </div>,
        document.body,
      )}

      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="relative w-full max-w-[440px] rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-label={`确认删除「${deleteTarget.title}」`}>
            <button type="button" aria-label="取消" onClick={() => setDeleteTarget(null)} className="absolute right-5 top-5 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
            <h3 className="pr-8 text-[16px] font-semibold text-slate-900">确认删除「{deleteTarget.title}」</h3>
            <p className="mt-3 text-[13px] leading-relaxed text-slate-500">此操作无法撤回，删除对话后，仍可在「资产」中找回已生成的内容，确认删除么？</p>
            <div className="mt-7 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-xl bg-[#F2F3F5] px-5 py-2 text-[13px] text-slate-800 hover:bg-[#E5E6EB]">取消</button>
              <button type="button" onClick={() => { deleteSession(deleteTarget.id); setDeleteTarget(null); }} className="rounded-xl bg-black px-5 py-2 text-[13px] text-white hover:bg-slate-800">删除</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
