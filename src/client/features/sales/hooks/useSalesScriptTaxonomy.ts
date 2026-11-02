import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
import { createScriptTaxonomy, deleteScriptTaxonomy, listScriptTaxonomy, renameScriptTaxonomy } from '../api/salesScriptTaxonomy';

export function useSalesScriptTaxonomy() {
  const [items, setItems] = useState<ScriptTaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const listAbort = useRef<AbortController | null>(null);
  const invalidateList = useCallback(() => {
    listAbort.current?.abort();
    listAbort.current = null;
    setLoading(false);
  }, []);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (busyRef.current || signal?.aborted) return;
    listAbort.current?.abort();
    const controller = new AbortController();
    listAbort.current = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    setLoading(true);
    try { const rows = await listScriptTaxonomy(controller.signal); if (!controller.signal.aborted) { setItems(rows); setError(''); } }
    catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '读取分类与风格失败'); }
    finally {
      signal?.removeEventListener('abort', abort);
      if (listAbort.current === controller) { listAbort.current = null; setLoading(false); }
    }
  }, []);
  useEffect(() => { void refresh(); return () => listAbort.current?.abort(); }, [refresh]);

  const mutate = async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try { return await operation(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存分类与风格失败'); return null; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const create = async (kind: ScriptTaxonomyKind, name: string): Promise<ScriptTaxonomyItem | null> => mutate(async () => {
    const item = await createScriptTaxonomy(kind, name);
    invalidateList();
    setItems((rows) => [...rows, item]);
    return item;
  });
  const rename = async (id: string, name: string) => Boolean(await mutate(async () => {
    const item = await renameScriptTaxonomy(id, name);
    invalidateList();
    setItems((rows) => rows.map((row) => row.id === id ? item : row));
    return item;
  }));
  const remove = async (id: string) => Boolean(await mutate(async () => {
    await deleteScriptTaxonomy(id);
    invalidateList();
    setItems((rows) => rows.filter((row) => row.id !== id));
    return true;
  }));
  return { items, loading, busy, error, refresh, create, rename, remove, clearError: () => setError('') };
}
