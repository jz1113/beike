import { useEffect, useRef, useState } from 'react';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { readSalesAssetDraft, salesAssetDraftKey, writeSalesAssetDraft, type SalesAssetDraft } from '../model/salesAssetDraft';

export type SalesAssetDraftStatus = 'idle' | 'restored' | 'saved' | 'error';

export function useSalesAssetDraft(kind: 'persona' | 'scene', id: string | undefined, initialFields: Record<string, string>) {
  const [key] = useState(() => salesAssetDraftKey(getWorkspaceSecret(), kind, id));
  const [saved] = useState(() => readSalesAssetDraft(key));
  const [fields, setFields] = useState(() => ({ ...initialFields, ...saved?.fields }));
  const [error, setError] = useState('');
  const [status, setStatus] = useState<SalesAssetDraftStatus>(saved ? 'restored' : 'idle');
  const current = useRef<SalesAssetDraft>({ ...saved, fields });
  const failed = useRef(false);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (failed.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  const update = (patch: Partial<SalesAssetDraft>): boolean => {
    current.current = { ...current.current, ...patch };
    try { writeSalesAssetDraft(key, current.current); failed.current = false; setError(''); setStatus('saved'); return true; }
    catch { failed.current = true; setStatus('error'); setError('本机草稿保存失败，请保留当前窗口并尽快保存到资产库。'); return false; }
  };
  const setField = (name: string, value: string) => {
    const next = { ...current.current.fields, [name]: value };
    setFields(next);
    update({ fields: next });
  };
  const clear = () => {
    // A saved asset must not be presented as an unsaved draft on the next visit.
    try { localStorage.removeItem(key); failed.current = false; setError(''); setStatus('idle'); return true; }
    catch { setError('本机草稿清除失败，请重试。'); return false; }
  };
  return { saved, fields, setField, update, clear, flush: () => update({}), error, status, restored: Boolean(saved) };
}
