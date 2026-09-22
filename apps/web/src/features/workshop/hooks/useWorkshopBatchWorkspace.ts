import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkshopBatch, WorkshopBatchSummary } from '@beike/contracts/workshopBatches';
import type { WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';
import { workshopBatchSchema, workshopBatchSummarySchema } from '@beike/contracts/workshopBatches';
import { workshopSnapshotSchema } from '@beike/contracts/workshopWorkspace';
import { apiFetch } from '@/shared/api/apiClient';
import { recoverWorkspace } from '../model/workspaceRecovery';

function parseBatchResponse(data: unknown): WorkshopBatch {
  return workshopBatchSchema.parse((data as { batch?: unknown }).batch);
}

export function useWorkshopBatchWorkspace(snapshot: WorkshopSnapshot, restore: (snapshot: WorkshopSnapshot) => void) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('正在加载当前批次…');
  const [error, setError] = useState('');
  const [activeBatch, setActiveBatch] = useState<WorkshopBatch | null>(null);
  const [historyBatches, setHistoryBatches] = useState<WorkshopBatchSummary[]>([]);
  const revision = useRef(0);
  const saved = useRef('');
  const latest = useRef(snapshot);
  const restoreRef = useRef(restore);
  const busy = useRef(false);
  const blocked = useRef(false);
  const alive = useRef(true);
  latest.current = snapshot;
  restoreRef.current = restore;
  const serialized = useMemo(() => JSON.stringify(snapshot), [snapshot]);

  const refreshHistory = useCallback(async () => {
    const response = await apiFetch('/api/catalog/workshop-batches');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '历史批次读取失败');
    const batches = Array.isArray(data.batches) ? data.batches.map((value: unknown) => workshopBatchSummarySchema.parse(value)) : [];
    if (alive.current) setHistoryBatches(batches);
    return batches;
  }, []);

  const adoptBatch = useCallback((batch: WorkshopBatch, message: string) => {
    const restored = recoverWorkspace(workshopSnapshotSchema.parse(batch.snapshot));
    revision.current = batch.revision;
    saved.current = JSON.stringify(restored);
    latest.current = restored;
    restoreRef.current(restored);
    setActiveBatch(batch);
    setStatus(message);
    setError('');
  }, []);

  const loadActive = useCallback(async () => {
    setReady(false);
    blocked.current = false;
    setStatus('正在加载当前批次…');
    try {
      const response = await apiFetch('/api/catalog/workshop-batches/active');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '当前批次读取失败');
      adoptBatch(parseBatchResponse(data), '当前批次已就绪');
      if (alive.current) setReady(true);
      await refreshHistory();
    } catch (cause) {
      if (!alive.current) return;
      setError(cause instanceof Error ? cause.message : '当前批次读取失败');
      setStatus('批次加载失败，未覆盖本地内容');
    }
  }, [adoptBatch, refreshHistory]);

  useEffect(() => {
    alive.current = true;
    void loadActive();
    return () => { alive.current = false; };
  }, [loadActive]);

  const flush = useCallback(async () => {
    if (!ready || !activeBatch || busy.current || blocked.current) return;
    const json = JSON.stringify(latest.current);
    if (json === saved.current) return;
    busy.current = true;
    setStatus('正在保存当前批次…');
    try {
      const response = await apiFetch(`/api/catalog/workshop-batches/${activeBatch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: revision.current, snapshot: JSON.parse(json) }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) blocked.current = true;
        throw new Error(data.error || '当前批次保存失败');
      }
      if (!Number.isInteger(data.revision) || data.revision !== revision.current + 1) {
        blocked.current = true;
        throw new Error('批次版本未确认，请重新加载核实');
      }
      revision.current = data.revision;
      saved.current = json;
      if (alive.current) {
        setActiveBatch(previous => previous ? { ...previous, revision: data.revision, updatedAt: data.updatedAt } : previous);
        setStatus('当前批次已保存');
        setError('');
      }
    } catch (cause) {
      blocked.current = true;
      if (alive.current) {
        setError(cause instanceof Error ? cause.message : '当前批次保存失败');
        setStatus('当前批次尚未确认保存');
      }
    } finally {
      busy.current = false;
    }
  }, [activeBatch, ready]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => { void flush(); }, 1200);
    const onVisibility = () => { if (document.visibilityState === 'hidden') void flush(); };
    window.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(timer); window.removeEventListener('visibilitychange', onVisibility); };
  }, [flush, ready]);

  const requestBatch = useCallback(async (url: string, init: RequestInit, successMessage: string) => {
    await flush();
    const response = await apiFetch(url, init);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '批次操作失败');
    const batch = parseBatchResponse(data);
    blocked.current = false;
    adoptBatch(batch, successMessage);
    await refreshHistory();
  }, [adoptBatch, flush, refreshHistory]);

  const createNewBatch = useCallback(async (name?: string) => {
    await requestBatch('/api/catalog/workshop-batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(name ? { name } : {}),
    }, '已创建新的空白批次');
  }, [requestBatch]);

  const duplicateBatch = useCallback(async (id: string) => {
    await requestBatch(`/api/catalog/workshop-batches/${id}/duplicate`, { method: 'POST' }, '已复制为新的活跃批次');
  }, [requestBatch]);

  const archiveCurrentBatch = useCallback(async (force = true) => {
    await requestBatch('/api/catalog/workshop-batches/active/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }, '原批次已归档，新的空白批次已就绪');
  }, [requestBatch]);

  const clearHistory = useCallback(async () => {
    const response = await apiFetch('/api/catalog/workshop-batches/history', { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '历史批次清空失败');
    await refreshHistory();
    return Number(data.deleted) || 0;
  }, [refreshHistory]);

  const renameBatch = useCallback(async (id: string, name: string) => {
    const response = await apiFetch(`/api/catalog/workshop-batches/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '批次命名失败');
    const batch = parseBatchResponse(data);
    if (batch.id === activeBatch?.id && alive.current) setActiveBatch(batch);
    await refreshHistory();
  }, [activeBatch?.id, refreshHistory]);

  const readBatch = useCallback(async (id: string) => {
    const response = await apiFetch(`/api/catalog/workshop-batches/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '历史批次读取失败');
    return parseBatchResponse(data);
  }, []);

  return {
    ready,
    status: ready && !error && status === '当前批次已保存' && serialized !== saved.current ? '等待保存当前批次…' : status,
    error,
    activeBatch,
    historyBatches,
    refreshHistory,
    createNewBatch,
    duplicateBatch,
    archiveCurrentBatch,
    clearHistory,
    renameBatch,
    readBatch,
    reload: loadActive,
  };
}
