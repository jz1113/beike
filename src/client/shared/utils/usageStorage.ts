import { currentUsageEpoch, INITIAL_USAGE_EPOCH, USAGE_EPOCH_KEY, type UsageLogItem } from './usageScope';
export { currentUsageEpoch };

const LEGACY_KEY = 'app_real_usage_logs';
const PREFIX = 'beike.usage-receipt.v1:';
const EPOCH_KEY = USAGE_EPOCH_KEY;
const initialEpoch = INITIAL_USAGE_EPOCH;
const uniqueId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
export const USAGE_LOG_EVENT = 'beike-usage-updated';
export const USAGE_STORAGE_EVENT = 'beike-usage-storage';
const writer = uniqueId();
const states = new WeakMap<Storage, { pending: Map<string, UsageLogItem>; error: boolean; epoch: string }>();
const watched = new WeakSet<Window>();
const epoch = currentUsageEpoch;
function state() {
  const currentEpoch = epoch();
  let value = states.get(localStorage);
  if (!value || value.epoch !== currentEpoch) {
    if (value?.error) queueMicrotask(() => notify(USAGE_STORAGE_EVENT));
    value = { pending: new Map(), error: false, epoch: currentEpoch }; states.set(localStorage, value);
  }
  return value;
}
function notify(name = USAGE_LOG_EVENT) { if (typeof window !== 'undefined') window.dispatchEvent(new Event(name)); }
function keys() {
  const found: string[] = [];
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(PREFIX)) found.push(key); }
  return found;
}
function watch() {
  if (typeof window === 'undefined' || !window.addEventListener || watched.has(window)) return;
  watched.add(window);
  window.addEventListener('storage', event => {
    if (event.storageArea === localStorage && (!event.key || event.key === LEGACY_KEY || event.key === EPOCH_KEY || event.key.startsWith(PREFIX))) notify();
    retryUsageStorage();
  });
  window.addEventListener('focus', retryUsageStorage);
}
export function hasPendingUsageStorage(): boolean { return typeof localStorage !== 'undefined' && state().error; }

/** Independent page keys avoid overwrite; the persisted epoch invalidates pre-clear queues. */
export function saveUsageReceipt(row: UsageLogItem): void {
  watch();
  const current = state();
  const receiptEpoch = row.scope?.epoch || initialEpoch;
  if (receiptEpoch !== current.epoch) return;
  current.pending.set(PREFIX + receiptEpoch + ':' + writer + ':' + row.id, structuredClone(row));
  retryUsageStorage();
  notify();
}
export function retryUsageStorage(): void {
  if (typeof localStorage === 'undefined') return;
  const current = state();
  for (const [key, row] of current.pending) {
    if (epoch() !== current.epoch) { state(); break; }
    try { localStorage.setItem(key, JSON.stringify({ ...row, usageEpoch: row.scope?.epoch || initialEpoch })); current.pending.delete(key); }
    catch { break; }
  }
  const latest = state();
  const error = latest.pending.size > 0;
  if (latest.error !== error) { latest.error = error; notify(USAGE_STORAGE_EVENT); }
  notify();
}
export function readUsageReceipts(): UsageLogItem[] {
  watch();
  const current = state();
  const rows: UsageLogItem[] = [];
  const read = (key: string, legacy = false) => {
    try {
      const raw = localStorage.getItem(key); if (!raw) return;
      const parsed = JSON.parse(raw);
      const values = legacy ? parsed : [parsed];
      if (Array.isArray(values)) for (const row of values) {
        if (row && typeof row.id === 'string' && typeof row.modelId === 'string' && (row.usageEpoch || initialEpoch) === current.epoch && (row.scope?.epoch || initialEpoch) === current.epoch) {
          const receipt = { ...row };
          delete receipt.usageEpoch;
          rows.push(receipt);
        }
      }
    } catch { /* Keep unreadable records in storage, and continue reading other receipts. */ }
  };
  if (current.epoch === initialEpoch) read(LEGACY_KEY, true);
  keys().forEach(key => read(key));
  rows.push(...current.pending.values());
  return epoch() === current.epoch ? rows : [];
}
export function clearUsageReceipts(): void {
  const oldKeys = keys();
  // Persist the barrier before deleting anything. A failed marker write preserves history.
  localStorage.setItem(EPOCH_KEY, uniqueId());
  state();
  oldKeys.forEach(key => localStorage.removeItem(key));
  localStorage.removeItem(LEGACY_KEY);
  notify(USAGE_STORAGE_EVENT); notify();
}
