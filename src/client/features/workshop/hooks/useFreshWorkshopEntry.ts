import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@client/store';

/** Explicit home entry only. Never persisted or inferred from mounting/refreshing. */
export function useFreshWorkshopEntry(ready: boolean, start: () => Promise<void>, notify: (message: string) => void) {
  const pending = useAppStore(state => state.pendingFreshWorkshopEntry);
  const [processing, setProcessing] = useState(false);
  const action = useRef({ start, notify });
  action.current = { start, notify };

  useEffect(() => {
    if (!ready || processing || !pending || !useAppStore.getState().pendingFreshWorkshopEntry) return;
    // Claim synchronously, so StrictMode and repeated renders cannot archive twice.
    useAppStore.setState({ pendingFreshWorkshopEntry: false });
    setProcessing(true);
    void action.current.start().catch(cause => {
      action.current.notify(`未开始新批次，已保留当前内容：${cause instanceof Error ? cause.message : '请稍后重试'}`);
    }).finally(() => setProcessing(false));
  }, [ready, processing, pending]);

  return pending || processing;
}
