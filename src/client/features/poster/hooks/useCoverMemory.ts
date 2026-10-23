import { useCallback, useEffect, useState } from 'react';
import {
  addCoverCorrection,
  clearCoverTrash,
  fetchCoverMemory,
  setCoverMemoryStatus,
} from '../api/coverMemoryApi';
import type { CoverMemoryEntry, CoverMemoryResponse, CoverMemoryStatus } from '@shared/contracts/coverMemory';

const empty: CoverMemoryResponse = { success: true, entries: [], samples: [], usages: [] };

export function useCoverMemory(active: boolean) {
  const [memory, setMemory] = useState<CoverMemoryResponse>(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const next = await fetchCoverMemory();
    setMemory(next);
    setError(null);
    return next;
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetchCoverMemory().then((next) => {
      if (!cancelled) setMemory(next);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '封面记忆读取失败');
    });
    return () => { cancelled = true; };
  }, [active]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '封面记忆操作失败');
      return false;
    } finally {
      setBusy(false);
    }
  }, [reload]);

  return {
    memory,
    error,
    busy,
    reload,
    setStatus: (entry: CoverMemoryEntry, status: CoverMemoryStatus) => run(() => setCoverMemoryStatus(entry.id, status)),
    addCorrection: (rule: string) => run(() => addCoverCorrection(rule)),
    clearTrash: () => run(() => clearCoverTrash()),
  };
}
