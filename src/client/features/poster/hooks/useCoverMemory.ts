import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addCoverCorrection, clearCoverTrash, fetchCoverMemory, restoreCoverRevision,
  saveCoverFeedback, setCoverMemoryStatus,
} from '../api/coverMemoryApi';
import { CoverMemoryResponseSchema, type CoverMemoryEntry, type CoverMemoryResponse, type CoverMemoryStatus } from '@shared/contracts/coverMemory';

export function useCoverMemory(active: boolean) {
  const [memory, setMemory] = useState<CoverMemoryResponse>(() => CoverMemoryResponseSchema.parse({ success: true }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const request = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current += 1; }; }, []);

  const reload = useCallback(async () => {
    const sequence = ++request.current;
    const next = await fetchCoverMemory();
    if (alive.current && sequence === request.current) { setMemory(next); setError(null); }
    return next;
  }, []);
  const refresh = useCallback(async () => {
    try { await reload(); } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : '封面记忆读取失败');
    }
  }, [reload]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [active, refresh]);
  const hasRunning = memory.samples.some((sample) => sample.status === 'running');
  useEffect(() => {
    if (!active || !hasRunning) return;
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [active, hasRunning, refresh]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true); setError(null);
    try {
      await action(); await reload(); return true;
    } catch (reason) {
      // Recover a persisted operation even when its browser response was lost.
      try { await reload(); } catch { /* Preserve the actionable operation error below. */ }
      if (alive.current) setError(reason instanceof Error ? reason.message : '封面记忆操作失败');
      return false;
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }, [reload]);

  return {
    memory, error, busy, reload, refresh, run,
    setStatus: (entry: CoverMemoryEntry, status: CoverMemoryStatus) => run(() => setCoverMemoryStatus(entry.id, status)),
    addCorrection: (rule: string) => run(() => addCoverCorrection(rule)),
    clearTrash: () => run(() => clearCoverTrash()),
    restoreRevision: (id: string) => run(() => restoreCoverRevision(id)),
    saveFeedback: (id: string, rating: '' | 'good' | 'bad', note: string, correction: string) => run(() => saveCoverFeedback(id, rating, note, correction)),
  };
}
