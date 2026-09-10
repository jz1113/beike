/**
 * 任务中心客户端 store + API
 *
 * 让客户端可以列出所有 running / awaiting_approval 的 turn，
 * 并对单个 turn 触发「恢复」（recover）/「打断」。
 */

import { create } from 'zustand';
import { apiFetch } from '@/lib/apiClient';

export interface ActiveRun {
  turnId: string;
  threadId: string;
  status: 'running' | 'awaiting_approval' | 'completed' | 'interrupted' | 'failed';
  model?: string | null;
  startedAt: number;
  completedAt?: number | null;
  usage?: { inputTokens: number; outputTokens: number };
}

interface TaskCenterState {
  runs: ActiveRun[];
  activeRuns: ActiveRun[];
  loading: boolean;
  lastFetchedAt: number;
  /** 自动刷新句柄 */
  pollHandle: number | null;
  fetchRuns: () => Promise<void>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
  recoverTurn: (turnId: string) => Promise<unknown | null>;
}

export const useTaskCenter = create<TaskCenterState>((set, get) => ({
  runs: [],
  activeRuns: [],
  loading: false,
  lastFetchedAt: 0,
  pollHandle: null,

  fetchRuns: async () => {
    set({ loading: true });
    try {
      // 'active' 不是合法 status 枚举；不传 status 服务端会自动限制为活跃 turn
      const res = await apiFetch('/api/assistant/runs');
      if (!res.ok) {
        set({ loading: false });
        return;
      }
      const data = await res.json();
      const runs: ActiveRun[] = Array.isArray(data.runs) ? data.runs : [];
      const activeRuns = runs.filter(
        (r) => r.status === 'running' || r.status === 'awaiting_approval'
      );
      set({
        runs,
        activeRuns,
        loading: false,
        lastFetchedAt: Date.now(),
      });
    } catch {
      set({ loading: false });
    }
  },

  startPolling: (intervalMs = 5000) => {
    const handle = get().pollHandle;
    if (handle !== null) return;
    void get().fetchRuns();
    const id = window.setInterval(() => {
      void get().fetchRuns();
    }, intervalMs);
    set({ pollHandle: id });
  },

  stopPolling: () => {
    const handle = get().pollHandle;
    if (handle !== null) {
      window.clearInterval(handle);
      set({ pollHandle: null });
    }
  },

  recoverTurn: async (turnId) => {
    try {
      const res = await apiFetch(`/api/assistant/turns/${encodeURIComponent(turnId)}/recover`, {
        method: 'POST',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.snapshot || null;
    } catch {
      return null;
    }
  },
}));
