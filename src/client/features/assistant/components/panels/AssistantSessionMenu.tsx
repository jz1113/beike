import { getAssistantMessageText } from '../message/assistantMessagePresentation';
import { useAssistantDialog } from '../useAssistantDialog';
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, Search, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

export default function AssistantSessionMenu({ id, onClose }: { id: string; onClose: () => void }) {
  const { sessions, currentId, select, rename, remove } = useAppStore(useShallow(s => ({
    sessions: s.assistantSessions, currentId: s.currentAssistantSessionId,
    select: s.switchAssistantSession,
    rename: s.renameAssistantSession, remove: s.deleteAssistantSession,
  })));
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const rootRef = useAssistantDialog(true, () => { if (editingId || confirmId) { setEditingId(null); if (!busy) setConfirmId(null); } else onClose(); });
  const deleteGuard = useRef(false);
  const editRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus({ preventScroll: true });
  }, []);
  useEffect(() => { if (editingId) { editRef.current?.focus(); editRef.current?.select(); } }, [editingId]);
  const restoreRowFocus = (sessionId: string) => requestAnimationFrame(() => {
    rootRef.current?.querySelectorAll<HTMLButtonElement>('.agent-session-select').forEach(button => {
      if (button.dataset.sessionId === sessionId) button.focus({ preventScroll: true });
    });
  });
  const saveTitle = () => {
    if (!editingId || !title.trim()) return;
    rename(editingId, title.trim()); restoreRowFocus(editingId); setEditingId(null);
  };
  const deleteSession = async (sessionId: string) => {
    if (deleteGuard.current) return;
    deleteGuard.current = true;
    setBusy(true); setFeedback('');
    try {
      const result = await remove(sessionId);
      setConfirmId(null);
      setFeedback(result.success ? '对话已删除' : `已从本地移除，服务端同步失败${result.error ? `：${result.error}` : ''}`);
    } catch (error) { setFeedback(formatUserError(error, '删除失败')); }
    finally { deleteGuard.current = false; setBusy(false); }
  };
  const filtered = sessions.filter(s => `${s.title} ${s.messages.map(getAssistantMessageText).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div ref={rootRef} id={id} role="dialog" aria-modal="false" tabIndex={-1} aria-label="历史对话" className="agent-popover agent-session-menu" onKeyDown={event => {
    if (event.key === 'Escape' && (editingId || confirmId)) {
      event.preventDefault(); event.stopPropagation();
      const rowId = editingId || confirmId;
      setEditingId(null); if (!busy) setConfirmId(null);
      if (rowId) restoreRowFocus(rowId);
    }
  }}>
    <div className="agent-session-menu-label">历史对话</div>
    {sessions.length > 6 && <label className="agent-search agent-session-search"><Search size={13} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索对话" aria-label="搜索历史对话" /></label>}
    <div className="agent-session-list">
      {filtered.map(session => <div key={session.id} className="agent-session-row" data-current={session.id === currentId}>
        {editingId === session.id ? <form className="agent-session-edit" onSubmit={e => { e.preventDefault(); saveTitle(); }}>
          <input ref={editRef} value={title} onChange={e => setTitle(e.target.value)} aria-label="对话名称" maxLength={100} onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault(); }} />
          <button type="submit" className="agent-session-action" aria-label="保存对话名称" disabled={!title.trim()}><Check size={14} /></button>
          <button type="button" className="agent-session-action" aria-label="取消重命名" onClick={() => { setEditingId(null); restoreRowFocus(session.id); }}><X size={14} /></button>
        </form> : confirmId === session.id ? <div className="agent-session-confirm">
          <span>{busy ? '正在删除…' : '删除此对话？不可恢复'}</span>
          <button type="button" disabled={busy} onClick={() => { setConfirmId(null); restoreRowFocus(session.id); }}>取消</button>
          <button type="button" className="agent-session-delete" disabled={busy} onClick={() => void deleteSession(session.id)}>{busy ? <Loader2 size={13} className="animate-spin" /> : '删除'}</button>
        </div> : <>
          <button type="button" className="agent-session-select" data-session-id={session.id} aria-current={session.id === currentId ? 'true' : undefined} disabled={busy} title={session.title} onClick={() => { if (session.id !== currentId) select(session.id); onClose(); }}>{session.title || '未命名对话'}</button>
          <button type="button" className="agent-session-action" disabled={busy} aria-label={`重命名对话 ${session.title}`} title="重命名" onClick={() => { setTitle(session.title); setEditingId(session.id); setConfirmId(null); }}><Pencil size={13} /></button>
          <button type="button" className="agent-session-action agent-session-delete" disabled={busy} aria-label={`删除对话 ${session.title}`} title="删除" onClick={() => { setConfirmId(session.id); setEditingId(null); }}><Trash2 size={13} /></button>
        </>}
      </div>)}
      {!filtered.length && <p className="agent-session-empty">没有匹配的对话</p>}
    </div>
    {feedback && <p role="status" className="agent-session-feedback">{feedback}</p>}
  </div>;
}
