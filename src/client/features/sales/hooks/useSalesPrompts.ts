import { useCallback, useEffect, useRef, useState } from 'react';
import type { SalesPrompt } from '@shared/contracts/salesPrompts';
import { listSalesPrompts, SalesPromptRequestError, saveSalesPrompt } from '../api/salesPrompts';

const managedPromptIds = new Set(['summary', 'script-analysis', 'script-normalize', 'plan-adapt', 'persona-grid', 'scene-grid']);

export function useSalesPrompts(enabled: boolean) {
  const [items, setItems] = useState<SalesPrompt[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState('');
  const [verified, setVerified] = useState(false);
  const busyRef = useRef(false);
  const loadedRef = useRef(false);
  const refreshAfterSaveRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const dirty = (item: SalesPrompt) => {
    const draft = drafts[item.id];
    return draft !== undefined && draft !== item.prompt;
  };
  const hasUnsaved = items.some(dirty);
  const selected = items.find((item) => item.id === selectedId) ?? items[0];

  const refresh = useCallback(async () => {
    if (busyRef.current) { refreshAfterSaveRef.current = true; return; }
    requestRef.current?.abort();
    const abort = new AbortController();
    requestRef.current = abort;
    setLoading(true);
    setVerified(false);
    setError('');
    try {
      const rows = await listSalesPrompts(abort.signal);
      if (abort.signal.aborted) return;
      setItems(rows.filter((item) => managedPromptIds.has(item.id)));
      setDrafts((previous) => {
        const next = { ...previous };
        for (const item of rows) if (next[item.id] === item.prompt) delete next[item.id];
        return next;
      });
      setVerified(true);
      setConflict(false);
      setNotice(loadedRef.current ? '已读取最新保存内容；未保存的编辑仍保留，核对后可继续保存。' : '');
      loadedRef.current = true;
    } catch (err) {
      if (!abort.signal.aborted) setError(err instanceof Error ? err.message : '读取提示词失败');
    } finally {
      if (requestRef.current === abort) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setVerified(false);
      setLoading(false);
      return;
    }
    void refresh();
    return () => requestRef.current?.abort();
  }, [enabled, refresh]);
  useEffect(() => {
    if (!hasUnsaved) return;
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [hasUnsaved]);

  const updateDraft = (text: string) => {
    if (!selected || busyRef.current || requestRef.current || saving || loading) return;
    setDrafts((previous) => {
      const next = { ...previous };
      if (text === selected.prompt) delete next[selected.id];
      else next[selected.id] = text;
      return next;
    });
    setNotice('');
  };
  const discardDraft = () => {
    if (!selected || busyRef.current || requestRef.current || saving || loading) return;
    setDrafts((previous) => { const next = { ...previous }; delete next[selected.id]; return next; });
    setNotice('已撤销当前环节的未保存修改。');
  };
  const save = async () => {
    if (!selected || !dirty(selected) || busyRef.current || requestRef.current || loading || !verified) return;
    const draft = drafts[selected.id];
    if (!draft.trim()) { setError('提示词不能为空，请填写内容。'); return; }
    busyRef.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await saveSalesPrompt(selected.id, draft, selected.version);
      setItems((previous) => previous.map((item) => item.id === saved.id ? saved : item));
      setDrafts((previous) => {
        const next = { ...previous };
        if (next[saved.id] === saved.prompt) delete next[saved.id];
        return next;
      });
      setVerified(true);
      setConflict(false);
      setNotice(`「${saved.title}」已更新为系统当前提示词，后续执行使用此内容。`);
    } catch (err) {
      setVerified(false);
      setError(err instanceof Error ? err.message : '保存提示词失败');
      setConflict(err instanceof SalesPromptRequestError && err.status === 409);
    } finally {
      busyRef.current = false;
      setSaving(false);
      if (refreshAfterSaveRef.current) { refreshAfterSaveRef.current = false; void refresh(); }
    }
  };

  return {
    items, selected, selectedId: selected?.id ?? '',
    select: (id: string) => { setSelectedId(id); setNotice(''); },
    text: selected ? (drafts[selected.id] ?? selected.prompt) : '',
    dirty, hasUnsaved, loading, saving, verified, error, conflict, notice,
    refresh, updateDraft, discardDraft, save,
  };
}
