import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPosterInputDraft, persistPosterInputDraft, type PosterInputDraft } from '../model/posterInputDraft';

export function usePosterInputDraft(notify: (message: string) => void) {
  const [draft, setDraft] = useState<PosterInputDraft>({ pasteText: '', importMode: 'paste' });
  const [saveFailed, setSaveFailed] = useState(false);
  const latest = useRef(draft);
  const scopeRef = useRef<string | null>(null);
  const readable = useRef(true);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const restoreInputDraft = useCallback((scope: string) => {
    scopeRef.current = scope;
    try {
      const restored = loadPosterInputDraft(scope);
      readable.current = true;
      latest.current = restored;
      setDraft(restored);
    } catch {
      readable.current = false;
      setSaveFailed(true);
      notifyRef.current('输入草稿读取失败，原草稿未覆盖；当前输入会保留在页面，请在刷新前复制。');
    }
  }, []);

  const updateDraft = (patch: Partial<PosterInputDraft>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDraft(next);
    if (!scopeRef.current) return;
    try {
      if (!readable.current) throw new Error('原草稿尚未读取');
      persistPosterInputDraft(scopeRef.current, next);
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
      notify('浏览器无法保存输入草稿；当前输入会保留在页面，请在刷新前复制。');
    }
  };

  useEffect(() => {
    if (!saveFailed || !draft.pasteText.trim()) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [saveFailed, draft.pasteText]);

  return {
    ...draft,
    restoreInputDraft,
    setPasteText: (pasteText: string) => updateDraft({ pasteText }),
    setImportMode: (importMode: PosterInputDraft['importMode']) => updateDraft({ importMode }),
  };
}
