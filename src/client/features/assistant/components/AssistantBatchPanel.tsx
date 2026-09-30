import { useRef, useState } from 'react';
import { useAppStore } from '@client/store';
import type { MediaAttachment } from '@client/store/appStoreTypes';
import { buildAssistantBatch, extractImageBatch } from '../utils/batchImagePrompts';

export function AssistantImageBatch({ content, referenceMedia }: { content: string; referenceMedia: MediaAttachment[] }) {
  const entries = extractImageBatch(content);
  const [open, setOpen] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const lock = useRef(false);
  const model = useAppStore(s => s.quickModel);
  const quality = useAppStore(s => s.quickQuality);
  const size = useAppStore(s => s.quickAspectId);
  const conversation = useAppStore(s => s.assistantSessions.find(c => c.id === s.currentAssistantSessionId));
  const batches = (conversation?.messages || []).filter(m => m.role === 'assistant' && !m.error && extractImageBatch(m.content || '').length >= 2);
  const source = batches.find(m => m.content === content);
  const superseded = Boolean(source && batches[batches.length - 1]?.id !== source.id);
  const resultSession = source?.imageBatchSessionId || sessionId;
  if (entries.length < 2) return null;
  const selected = entries.filter(e => !excluded.includes(e.id));
  const generate = () => {
    if (lock.current || !selected.length || superseded || resultSession) return;
    lock.current = true;
    try {
      const tasks = buildAssistantBatch(selected, referenceMedia, { model, quality, size });
      const store = useAppStore.getState();
      store.addBatchGenerationTasks(tasks, `${selected[0].title} · 共 ${tasks.length} 张`, true);
      setSessionId(useAppStore.getState().currentSessionId);
      if (source && conversation) store.updateAssistantMessage(conversation.id, source.id, { imageBatchSessionId: useAppStore.getState().currentSessionId });
      store.setCurrentView('generate');
      store.setIsAssistantOpen(false);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '批量载入失败');
      lock.current = false;
    }
  };
  return <div className="sticky top-0 z-10 my-3 rounded-xl border border-zinc-200 bg-white p-3 text-xs">
    <div className="flex items-center justify-between gap-3">
      <span>{source ? `第 ${batches.indexOf(source) + 1} 版 · ` : '本条回复包含 '}{entries.length} 张生图提示词{superseded ? ' · 已有新版' : ''}</span>
      <button type="button" disabled={superseded && !resultSession} className="rounded-lg bg-zinc-900 px-3 py-2 text-white disabled:opacity-40" onClick={() => {
        if (resultSession) { const s = useAppStore.getState(); s.switchSession(resultSession); s.setCurrentView('generate'); s.setIsAssistantOpen(false); }
        else setOpen(!open);
      }}>{resultSession ? '查看本组结果' : superseded ? '请使用最新版本' : '批量生成'}</button>
    </div>
    {open && !resultSession && !superseded && <div className="mt-3 space-y-3">
      <p className="text-zinc-500">每条提示词生成 1 张，统一保存在一个生成会话中。使用当前生图设置：{model || '未选择模型'} · {size} · {quality === 'high' ? '高质量' : quality === 'medium' ? '中质量' : '低质量'}。提示词指定的比例优先。</p>
      <div className="max-h-60 overflow-auto space-y-2">{entries.map(entry => <label key={entry.id} className="flex items-start gap-2">
        <input type="checkbox" checked={!excluded.includes(entry.id)} onChange={e => setExcluded(old => e.target.checked ? old.filter(id => id !== entry.id) : [...old, entry.id])} />
        <span title={entry.code}>{entry.title}</span>
      </label>)}</div>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <button type="button" disabled={!selected.length || !model} onClick={generate} className="rounded-lg bg-zinc-900 px-3 py-2 text-white disabled:opacity-40">生成选中的 {selected.length} 张</button>
    </div>}
  </div>;
}
