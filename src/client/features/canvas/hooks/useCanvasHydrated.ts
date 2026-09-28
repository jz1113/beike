import { useEffect, useState } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';

export function useCanvasHydrated() {
  const [ready, setReady] = useState(useCanvasStore.persist.hasHydrated);
  useEffect(() => {
    const stop = useCanvasStore.persist.onFinishHydration(() => setReady(true));
    setReady(useCanvasStore.persist.hasHydrated());
    return stop;
  }, []);
  return ready;
}
