import { retryUsageStorage, USAGE_LOG_EVENT, hasPendingUsageStorage, currentUsageEpoch } from './usageStorage';
import { afterEach, expect, it, vi } from 'vitest';
import { clearUsageLogs, getUsageLogs, recordModelUsage } from './usageTracker';
const scope = { workspaceId: 'workspace', channelId: 'channel', mediaType: 'chat' };
function install() {
  const values = new Map<string, string>();
  let quota = false;
  let interleave: (() => void) | undefined;
  const storage = {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => { const value = values.get(key) ?? null; if (interleave) { const next = interleave; interleave = undefined; next(); } return value; },
    setItem: (key: string, value: string) => { if (quota) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  vi.stubGlobal('localStorage', storage); vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  return { values, storage, full: (value: boolean) => { quota = value; }, interleave: (fn: () => void) => { interleave = fn; } };
}
const record = (id: string, promptTokens = 3, completionTokens = 0) => recordModelUsage({ taskId: id, modelId: 'gpt-6-luna', modelName: 'GPT 6 Luna', provider: 'OpenAI', type: 'chat', scope: { ...scope, epoch: currentUsageEpoch() }, promptTokens, completionTokens, success: true });
afterEach(() => vi.unstubAllGlobals());
it('keeps old durable history on quota failure and retries pending receipts after space is freed', async () => {
  const local = install(); record('old'); const durable = [...local.values];
  local.full(true); record('pending');
  expect([...local.values]).toEqual(durable);
  expect(getUsageLogs().map(row => row.taskId).sort()).toEqual(['old', 'pending']);
  local.full(false); retryUsageStorage();
  vi.resetModules(); const refreshed = await import('./usageTracker');
  expect(refreshed.getUsageLogs().map(row => row.taskId).sort()).toEqual(['old', 'pending']);
});
it('does not overwrite another tab that writes between read and save', () => {
  const local = install(); local.interleave(() => record('tab-b')); record('tab-a');
  expect(getUsageLogs().map(row => row.taskId).sort()).toEqual(['tab-a', 'tab-b']);
});
it('merges independent tab receipts for the same operation without losing disjoint tokens', async () => {
  install(); record('same', 5);
  vi.resetModules(); const other = await import('./usageTracker');
  other.recordModelUsage({ taskId: 'same', modelId: 'gpt-6-luna', modelName: 'GPT 6 Luna', provider: 'OpenAI', type: 'chat', scope, completionTokens: 7, success: true });
  record('same', 2);
  const rows = getUsageLogs(); expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ promptTokens: 5, completionTokens: 7, totalTokens: 12 });
});

it('preserves legacy history on failed writes and explicit clear removes both storage formats', () => {
  const local = install();
  const legacy = { id: 'legacy', timestamp: Date.now(), modelId: 'legacy-model', modelName: 'legacy', provider: 'old', type: 'chat', totalTokens: 10, costUsd: 0, costRmb: 0, success: true };
  local.storage.setItem('app_real_usage_logs', JSON.stringify([legacy]));
  const raw = local.storage.getItem('app_real_usage_logs');
  local.full(true); record('new');
  expect(local.storage.getItem('app_real_usage_logs')).toBe(raw);
  expect(getUsageLogs()).toHaveLength(2);
  local.full(false);
  clearUsageLogs();
  expect(getUsageLogs()).toHaveLength(0);
  expect([...local.values.keys()].filter(key => key.startsWith('beike.usage-receipt.'))).toHaveLength(0);
});
it('merges two independently saved stale snapshots and keeps explicit zero cost', async () => {
  install();
  record('same', 5);
  const original = getUsageLogs()[0];
  vi.resetModules(); const otherStorage = await import('./usageStorage');
  otherStorage.saveUsageReceipt({ ...original, id: 'other-tab-row', promptTokens: 0, completionTokens: 7, totalTokens: 7, costSource: 'reported', costUsd: 0, costRmb: 0 });
  record('same', 2);
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ promptTokens: 5, completionTokens: 7, totalTokens: 12, costSource: 'reported', costUsd: 0 });
});
it('notifies other-page changes and retries pending receipts when focus returns', async () => {
  const local = install();
  const target = new EventTarget(); vi.stubGlobal('window', target);
  record('old');
  const refresh = vi.fn(); target.addEventListener(USAGE_LOG_EVENT, refresh);
  const event = new Event('storage'); Object.assign(event, { storageArea: local.storage, key: 'beike.usage-receipt.v1:other' });
  target.dispatchEvent(event); expect(refresh).toHaveBeenCalled();
  local.full(true); record('pending');
  expect(hasPendingUsageStorage()).toBe(true);
  local.full(false); target.dispatchEvent(new Event('focus'));
  expect([...local.values.values()].some(raw => raw.includes('pending'))).toBe(true);
  expect(hasPendingUsageStorage()).toBe(false);
});
it('does not revive another page pending receipts after clear, while accepting its new calls', async () => {
  const local = install();
  vi.resetModules(); const other = await import('./usageTracker');
  local.full(true);
  other.recordModelUsage({ taskId: 'old-pending', modelId: 'gpt-6-luna', modelName: 'GPT', provider: 'OpenAI', type: 'chat', scope, totalTokens: 7, success: true });
  local.full(false); clearUsageLogs();
  const otherStorage = await import('./usageStorage'); otherStorage.retryUsageStorage();
  expect(getUsageLogs()).toHaveLength(0);
  other.recordModelUsage({ taskId: 'after-clear', modelId: 'gpt-6-luna', modelName: 'GPT', provider: 'OpenAI', type: 'chat', scope: { ...scope, epoch: currentUsageEpoch() }, totalTokens: 9, success: true });
  expect(getUsageLogs().map(row => row.taskId)).toEqual(['after-clear']);
});
it('does not erase history if the clear marker cannot be persisted', () => {
  const local = install(); record('old'); local.full(true);
  expect(() => clearUsageLogs()).toThrow();
  expect(getUsageLogs().map(row => row.taskId)).toEqual(['old']);
});
it('ignores an old write racing after the durable clear barrier', async () => {
 const local = install(); vi.resetModules(); const other = await import('./usageTracker');
 local.full(true);
 other.recordModelUsage({ taskId: 'stale-write', modelId: 'gpt-6-luna', modelName: 'GPT', provider: 'OpenAI', type: 'chat', scope, totalTokens: 7, success: true });
 local.full(false);
 const set = local.storage.setItem;
 let once = true;
 vi.spyOn(local.storage, 'setItem').mockImplementation((key, value) => {
  if (once && key.startsWith('beike.usage-receipt.')) { once = false; clearUsageLogs(); }
  set(key, value);
 });
 const otherStorage = await import('./usageStorage'); otherStorage.retryUsageStorage();
 expect(getUsageLogs()).toHaveLength(0);
});
it('preserves a new call that arrives after the clear barrier but before old-key cleanup', () => {
 const local = install(); record('before'); const set = local.storage.setItem;
 vi.spyOn(local.storage, 'setItem').mockImplementation((key, value) => {
  set(key, value);
  if (key === 'beike.usage-clear.v1') record('after');
 });
 clearUsageLogs();
 expect(getUsageLogs().map(row => row.taskId)).toEqual(['after']);
});

it('P2 completed output survives a later independent stale pending or failed receipt with paid usage', async () => {
  install();
  const mediaScope = { ...scope, mediaType: 'video' };
  recordModelUsage({ localTaskId: 'video-op', modelId: 'wan3.0-video', modelName: 'video', provider: 'wan', type: 'video', scope: mediaScope, totalTokens: 12, success: true, mediaCount: 1, billableCount: 1, duration: 5 });
  const completed = getUsageLogs()[0];
  vi.resetModules(); const otherStorage = await import('./usageStorage');
  otherStorage.saveUsageReceipt({ ...completed, id: 'stale-other-page', timestamp: completed.timestamp + 1, totalTokens: 3, success: false, mediaCount: 0 });
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ success: true, mediaCount: 1, totalTokens: 12, costUsd: completed.costUsd });
});

it('P2 never stamps an old receipt with the new clear epoch at the storage boundary', async () => {
  const local = install(); record('before-clear');
  const stale = structuredClone(getUsageLogs()[0]);
  clearUsageLogs();
  const { saveUsageReceipt } = await import('./usageStorage');
  saveUsageReceipt(stale);
  expect(getUsageLogs()).toEqual([]);
  expect([...local.values.values()].some(raw => raw.includes('before-clear'))).toBe(false);
  record('after-clear');
  expect(getUsageLogs().map(row => row.taskId)).toEqual(['after-clear']);
});

it('P2 rejects a stale row when another tab clears after the tracker epoch check returns', () => {
  const local = install();
  const oldScope = { ...scope, epoch: currentUsageEpoch() };
  const read = local.storage.getItem;
  let epochReads = 0; let crossed = false;
  vi.spyOn(local.storage, 'getItem').mockImplementation(key => {
    const value = read(key);
    if (key === 'beike.usage-clear.v1' && ++epochReads === 3) {
      crossed = true; clearUsageLogs();
    }
    return value;
  });
  recordModelUsage({ taskId: 'cross-clear', scope: oldScope, modelId: 'gpt-6-luna', modelName: 'GPT', provider: 'OpenAI', type: 'chat', totalTokens: 11, success: true });
  expect(crossed).toBe(true); expect(getUsageLogs()).toEqual([]);
  record('after-race'); expect(getUsageLogs().map(row => row.taskId)).toEqual(['after-race']);
});
