import { useEffect, useRef, useState } from 'react';
import type { StoredSalesScript } from '../api/salesScripts';
import { addSalesScriptImportFiles, readSalesScriptImport, saveSalesScriptImport, type SalesScriptImportItem } from '../model/salesScriptImport';
import { runSalesScriptImportBatch } from '../api/salesScriptImport';

const STORAGE_ERROR = '批量进度未能保存，请保留当前页面并释放浏览器存储空间后继续。';
const ACTIVE = new Set<SalesScriptImportItem['status']>(['uploading', 'analyzing', 'saving', 'depth']);

export function useSalesScriptImport(onSaved: (item: StoredSalesScript) => void) {
  const [items, setItems] = useState(readSalesScriptImport);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [includeDepth, setIncludeDepth] = useState(true);
  const current = useRef(items);
  const operation = useRef<AbortController | null>(null);
  const handlers = useRef(onSaved); handlers.current = onSaved;
  const mounted = useRef(true);

  const commit = (next: SalesScriptImportItem[]) => {
    // Keep received uploads, model results and receipts even if persistence fills up.
    current.current = next;
    if (mounted.current) setItems(next);
    try { saveSalesScriptImport(next); }
    catch { throw new Error(STORAGE_ERROR); }
  };
  const patch = (key: string, value: Partial<SalesScriptImportItem>) => {
    if (!mounted.current) throw new Error('队列已暂停，可返回动作素材页继续');
    commit(current.current.map((item) => item.key === key ? { ...item, ...value } : item));
  };
  const edit = (next: SalesScriptImportItem[]) => {
    try { commit(next); setError(''); }
    catch { setError(STORAGE_ERROR); }
  };
  const addFiles = (files: File[]) => {
    if (operation.current) return;
    const added = addSalesScriptImportFiles(current.current, files);
    setErrors(added.errors); edit(added.items);
  };
  const stop = () => {
    operation.current?.abort();
    // Keep the operation lock until its outstanding request has settled.
  };
  const start = async (model: string) => {
    if (operation.current || !current.current.some((item) => item.status !== 'done')) return;
    if (!model) { setError('请先选择视频分析模型'); return; }
    try { saveSalesScriptImport(current.current); }
    catch { setError(STORAGE_ERROR); return; }
    const controller = new AbortController(); operation.current = controller;
    setPending(true); setError(''); setErrors([]);
    try {
      await runSalesScriptImportBatch(current.current, { model, includeDepth }, controller.signal, patch, (saved) => {
        if (mounted.current) handlers.current(saved);
      });
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : '批量导入已暂停，请重试未完成项');
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        try { if (mounted.current) commit(current.current.map((item) => ACTIVE.has(item.status) ? { ...item, status: 'queued', error: item.error || '处理已暂停，可继续未完成项' } : item)); }
        catch { if (mounted.current) setError(STORAGE_ERROR); }
        if (mounted.current) setPending(false);
      }
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current?.abort(); };
  }, []);

  return { items, pending, error, errors, includeDepth, setIncludeDepth: (value: boolean) => { if (!operation.current) setIncludeDepth(value); },
    addFiles, start, stop,
    remove: (key: string) => { if (!operation.current) edit(current.current.filter((item) => item.key !== key)); },
    clearCompleted: () => { if (!operation.current) edit(current.current.filter((item) => item.status !== 'done')); } };
}
