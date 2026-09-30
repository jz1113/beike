import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '@client/shared/api/apiClient';
import { useAssistantDialog } from './useAssistantDialog';

interface MemoryView { enabled: boolean; summary: string; updatedAt: number; coveredCount: number; pendingCount: number }
export default function AssistantMemoryPanel({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const dialogRef = useAssistantDialog(true, onClose);
  const [memory, setMemory] = useState<MemoryView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const url = `/api/assistant/threads/${encodeURIComponent(sessionId)}/memory`;
  useEffect(() => {
    const controller = new AbortController();
    setMemory(null); setError('');
    apiFetch(url, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '读取失败');
      if (!controller.signal.aborted) setMemory(data.memory);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [url]);
  const update = async (body: { enabled?: boolean; clear?: boolean }) => {
    setBusy(true); setError('');
    try {
      const response = await apiFetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '保存失败');
      setMemory(data.memory); setConfirmClear(false);
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  };
  return <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 p-4" onClick={onClose}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="会话记忆" className="flex max-h-[80%] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">会话记忆</h2><button aria-label="关闭会话记忆" onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
      <p className="mb-3 text-xs leading-5 text-slate-500">仅用于当前会话，重启后保留。超过 30 条待处理消息时，将较早消息增量摘要，保留最近 20 条；较长历史会提前触发。采集时只保存文本，后续对话再整理。摘要会额外调用当前模型。</p>
      {error && <p role="alert" className="mb-3 text-sm text-orange-700">{error}</p>}
      {!memory && !error && <p className="text-sm">正在读取记忆…</p>}
      {memory && <>
        <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={memory.enabled} disabled={busy} onChange={e => void update({ enabled: e.target.checked })} />自动整理并使用本会话记忆</label>
        <p className="mb-2 text-xs text-slate-500">已摘要 {memory.coveredCount} 条 · 待处理及近期原文 {memory.pendingCount} 条{memory.updatedAt ? ` · 更新于 ${new Date(memory.updatedAt).toLocaleString()}` : ''}</p>
        <div className="min-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm leading-6 select-text">{memory.summary || '尚未形成摘要。对话积累后会自动整理，不需要手动复制历史消息。'}</div>
        <p className="mt-3 text-xs text-slate-500">摘要可能遗漏细节，可在对话中纠正。关闭后不再积累或使用记忆，已有摘要保留。</p>
        {confirmClear ? <div className="mt-3 text-sm"><p>清除摘要和待处理文本，保留聊天记录。清除前的消息不会再次自动记入摘要。</p><div className="mt-2 flex gap-3"><button disabled={busy} onClick={() => void update({ clear: true })} className="text-red-600">确认清除</button><button disabled={busy} onClick={() => setConfirmClear(false)}>取消</button></div></div>
          : <button disabled={busy} onClick={() => setConfirmClear(true)} className="mt-3 self-start text-sm text-slate-500 hover:text-red-600">清除本会话记忆</button>}
      </>}
    </section>
  </div>;
}
