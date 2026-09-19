import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/apiClient';
import { useWorkshopWorkspace } from '../useWorkshopWorkspace';
import { recoverWorkspace } from '../workspaceRecovery';
import { snapshotFixture } from './workspaceFixture';
vi.mock('@/lib/apiClient', () => ({ apiFetch: vi.fn() }));
beforeEach(() => { vi.mocked(apiFetch).mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('restores results without submitting model calls and flags ambiguous tasks', async () => {
  const snapshot = snapshotFixture();
  snapshot.items[0].tasks = [
    { id: 'ok', shot_no: 1, title: 'ok', prompt: 'p', status: 'SUCCESS', resultUrl: '/storage/result.png' },
    { id: 'running', shot_no: 2, title: 'next', prompt: 'p', status: 'IN_PROGRESS' },
  ];
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ revision: 3, snapshot }));
  const restore = vi.fn();
  const hook = renderHook(() => useWorkshopWorkspace(snapshotFixture(), restore));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(restore.mock.calls[0][0].items[0].tasks).toMatchObject([
    { status: 'SUCCESS', resultUrl: '/storage/result.png' }, { status: 'FAILURE', recoveryRequired: true },
  ]);
  expect(apiFetch).toHaveBeenCalledTimes(1);
});
it('does not write an empty workspace when initial loading fails', async () => {
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ error: '读取失败' }, { status: 500 }));
  const hook = renderHook(() => useWorkshopWorkspace(snapshotFixture(), vi.fn()));
  await waitFor(() => expect(hook.result.current.error).toBe('读取失败'));
  expect(hook.result.current.ready).toBe(false);
  expect(apiFetch).toHaveBeenCalledTimes(1);
});
it('serializes saves and preserves edits arriving while a save is in flight', async () => {
  vi.useFakeTimers();
  const initial = snapshotFixture(); let release!: (r: Response) => void;
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ revision: 0, snapshot: null }));
  const hook = renderHook(({ snapshot }) => useWorkshopWorkspace(snapshot, vi.fn()), { initialProps: { snapshot: initial } });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(hook.result.current.ready).toBe(true);
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  hook.rerender({ snapshot: { ...initial, batchInputText: 'first' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  hook.rerender({ snapshot: { ...initial, batchInputText: 'second' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(apiFetch).toHaveBeenCalledTimes(2);
  await act(async () => { release(Response.json({ revision: 1 })); });
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ revision: 2 }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  const body = JSON.parse(String(vi.mocked(apiFetch).mock.calls[2][1]?.body));
  expect(body).toMatchObject({ revision: 1, snapshot: { batchInputText: 'second' } });
});
it('stops automatic writes after a conflict instead of overwriting newer state', async () => {
  vi.useFakeTimers();
  const initial = snapshotFixture();
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ revision: 1, snapshot: initial }));
  const hook = renderHook(({ snapshot }) => useWorkshopWorkspace(snapshot, vi.fn()), { initialProps: { snapshot: initial } });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(hook.result.current.ready).toBe(true); vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ error: '版本冲突' }, { status: 409 }));
  hook.rerender({ snapshot: { ...initial, batchInputText: 'changed' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(hook.result.current.error).toBe('版本冲突');
});
it('clears transient analysis flags while keeping completed prompts and images', () => {
  const snapshot = snapshotFixture(); snapshot.items[0].isAnalyzing = true;
  const restored = recoverWorkspace(snapshot);
  expect(restored.items[0]).toMatchObject({ isAnalyzing: false, analyzedSuccess: false, prompts: snapshot.items[0].prompts });
  expect(snapshot.items[0].isAnalyzing).toBe(true);
});
