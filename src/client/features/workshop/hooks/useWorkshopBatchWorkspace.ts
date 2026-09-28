import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkshopBatchSummary } from '@shared/contracts/workshopBatches';
import { workshopBatchSchema, workshopSnapshotSchema, type WorkshopBatch } from '@shared/workshopSnapshot';
import type { WorkshopSnapshot } from '@shared/contracts/workshopWorkspace';
import { workshopBatchSummarySchema } from '@shared/contracts/workshopBatches';
import { apiFetch } from '@client/shared/api/apiClient';
import { recoverWorkspace, hasWorkspaceContent } from '../model/workspace/workspaceRecovery';
import { serializeWorkspaceSnapshot, WorkspaceSaveSession } from '../model/workspace/workspaceSave';

function parseBatchResponse(data: unknown): WorkshopBatch {
  return workshopBatchSchema.parse((data as { batch?: unknown }).batch);
}

export function useWorkshopBatchWorkspace(snapshot: WorkshopSnapshot, restore: (snapshot: WorkshopSnapshot) => void) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('正在加载当前批次…');
  const [error, setError] = useState('');
  const [activeBatch, setActiveBatch] = useState<WorkshopBatch | null>(null);
  const [historyBatches, setHistoryBatches] = useState<WorkshopBatchSummary[]>([]);
  const saveSession = useRef<WorkspaceSaveSession | null>(null);
  const loadSequence = useRef(0);
  const switching = useRef(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const saved = useRef('');
  const latest = useRef(snapshot);
  const restoreRef = useRef(restore);
  const alive = useRef(true);
  const activeBatchRef = useRef<WorkshopBatch | null>(null);
  const flushChain = useRef(Promise.resolve());
  latest.current = snapshot;
  restoreRef.current = restore;
  activeBatchRef.current = activeBatch;
  const serialized = useMemo(() => serializeWorkspaceSnapshot(snapshot), [snapshot]);

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
    saveSession.current = new WorkspaceSaveSession(batch);
    saved.current = saveSession.current.savedJson;
    latest.current = restored;
    restoreRef.current(restored);
    activeBatchRef.current = batch;
    setActiveBatch(batch);
    setStatus(message);
    setError('');
  }, []);

  const loadActive = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setReady(false);
    setStatus('正在加载当前批次…');
    try {
      const response = await apiFetch('/api/catalog/workshop-batches/active');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '当前批次读取失败');
      if (!alive.current || sequence !== loadSequence.current) return;
      adoptBatch(parseBatchResponse(data), '当前批次已就绪');
      if (alive.current) setReady(true);
      await refreshHistory();
    } catch (cause) {
      if (!alive.current || sequence !== loadSequence.current) return;
      setError(cause instanceof Error ? cause.message : '当前批次读取失败');
      setStatus('批次加载失败，未覆盖本地内容');
    }
  }, [adoptBatch, refreshHistory]);

  useEffect(() => {
    alive.current = true;
    void loadActive();
    return () => { alive.current = false; };
  }, [loadActive]);

  const persistSnapshot = useCallback(async (options?: { keepalive?: boolean; duringSwitch?: boolean; force?: boolean }) => {
    if (!ready || (switching.current && !options?.duringSwitch)) return false;
    const session = saveSession.current;
    if (!session || (session.blocked && !options?.force)) return false;
    const json = serializeWorkspaceSnapshot(latest.current);
    if (json === saved.current && !session.hasPendingSave) return true;
    if (!options?.force && Date.now() < session.retryAt) return false;
    if (alive.current) setStatus('正在保存当前批次…');
    try {
      const confirmed = await session.save(json, { ...options, fetch: apiFetch });
      if (saveSession.current !== session || !confirmed) return false;
      saved.current = session.savedJson;
      if (alive.current) {
        setActiveBatch(previous => previous && previous.id === session.batchId
          ? { ...previous, revision: session.revision, updatedAt: session.updatedAt }
          : previous);
        setStatus('当前批次已保存');
        setError('');
      }
      return true;
    } catch (cause) {
      if (saveSession.current !== session) return false;
      // A recovered older write may be confirmed even if saving newer edits fails.
      saved.current = session.savedJson;
      if (alive.current) {
        setError(cause instanceof Error ? cause.message : '当前批次保存失败');
        setStatus(session.blocked ? '本地修改已保留，需处理保存冲突' : '本地修改已保留，网络恢复后自动核对并重试');
      }
      return false;
    }
  }, [ready]);

  const flush = useCallback((options?: { keepalive?: boolean; duringSwitch?: boolean; force?: boolean }) => {
    const run = flushChain.current.then(() => persistSnapshot(options), () => persistSnapshot(options));
    flushChain.current = run.then(() => undefined, () => undefined);
    return run;
  }, [persistSnapshot]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => { void flush(); }, 1200);
    const onVisibility = () => { if (document.visibilityState === 'hidden') void flush(); };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (serializeWorkspaceSnapshot(latest.current) === saved.current && !saveSession.current?.hasPendingSave) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    const onPageHide = () => { void flush({ keepalive: true }); };
    const onOnline = () => { void flush({ force: true }); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flush({ keepalive: true });
    };
  }, [flush, ready]);

  const requestBatch = useCallback(async (url: string, init: RequestInit, successMessage: string) => {
    if (switching.current) throw new Error('正在切换批次，请稍候');
    switching.current = true;
    setIsSwitching(true);
    try {
      // Drain pending writes before freezing autosave for the archive/create request.
      await flushChain.current;
      const confirmed = await flush({ duringSwitch: true });
      if (!confirmed) throw new Error('当前批次尚未确认保存，已阻止切换以保护未保存内容。请先处理保存错误');
      const response = await apiFetch(url, init);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '批次操作失败');
      const batch = parseBatchResponse(data);
      adoptBatch(batch, successMessage);
      await refreshHistory().catch(cause => {
        setError(`批次已切换，但历史列表读取失败：${cause instanceof Error ? cause.message : '请重试'}`);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批次操作失败');
      throw cause;
    } finally {
      switching.current = false;
      setIsSwitching(false);
    }
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

  const startFreshEntry = useCallback(async () => {
    if (hasWorkspaceContent(latest.current)) {
      await archiveCurrentBatch();
    } else {
      // Already empty: reuse it rather than creating meaningless history entries.
      const empty = { ...latest.current, currentStage: 1, batchInputText: '' };
      latest.current = empty;
      restoreRef.current(empty);
      setStatus('空白批次已就绪，可开始新的创作');
    }
  }, [archiveCurrentBatch]);

  const clearHistory = useCallback(async () => {
    const response = await apiFetch('/api/catalog/workshop-batches/history', { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '历史批次清空失败');
    await refreshHistory();
    return Number(data.deleted) || 0;
  }, [refreshHistory]);

  const deleteHistoryBatch = useCallback(async (id: string) => {
    const response = await apiFetch(`/api/catalog/workshop-batches/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '历史记录删除失败');
    await refreshHistory();
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
    ready: ready && !isSwitching,
    startFreshEntry,
    flush,
    retrySave: () => flush({ force: true }),
    downloadDraft: () => {
      const url = URL.createObjectURL(new Blob([serializeWorkspaceSnapshot(latest.current)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `workshop-draft-${activeBatchRef.current?.id || 'unsaved'}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    status: ready && !error && !isSwitching && status !== '正在保存当前批次…' && serialized !== saved.current ? '等待保存当前批次…' : status,
    error,
    activeBatch,
    historyBatches,
    refreshHistory,
    createNewBatch,
    duplicateBatch,
    archiveCurrentBatch,
    clearHistory,
    deleteHistoryBatch,
    renameBatch,
    readBatch,
    reload: async () => {
      if (serializeWorkspaceSnapshot(latest.current) !== saved.current && !window.confirm('重新加载将用服务器版本替换当前内容，未保存的修改可能丢失。确定继续吗？')) return;
      await loadActive();
    },
  };
}
