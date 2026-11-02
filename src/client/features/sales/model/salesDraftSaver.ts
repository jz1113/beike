import { writeSalesCollection, type SalesCollectionState } from './salesCollectionDraft';

/** Keep edits immediate; serialize the latest draft once after a short idle period. */
export function createSalesDraftSaver(onSaved: () => void, onError: () => void, write = writeSalesCollection) {
  let pending: SalesCollectionState | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    if (idle !== undefined && typeof window !== 'undefined') window.cancelIdleCallback?.(idle);
    idle = undefined;
  };
  const flush = () => {
    cancel();
    if (!pending) return true;
    const snapshot = pending;
    pending = null;
    try { write(snapshot); onSaved(); return true; }
    catch { pending = snapshot; onError(); return false; }
  };
  return {
    queue(state: SalesCollectionState) {
      cancel();
      pending = state;
      timer = setTimeout(() => {
        timer = undefined;
        if (typeof window !== 'undefined' && window.requestIdleCallback) idle = window.requestIdleCallback(flush, { timeout: 1000 });
        else flush();
      }, 250);
    },
    flush,
    hasPending: () => pending !== null,
  };
}
