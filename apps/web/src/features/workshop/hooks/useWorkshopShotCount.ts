import { useState, useEffect, useCallback } from 'react';
import { usePersistentNumber } from '@/shared/hooks/usePersistentState';

export function useWorkshopShotCount() {
  const [fallback] = useState(() => {
    try {
      return 4;
    } catch {
      return 4;
    }
  });
  const [stored, setStored] = usePersistentNumber('workshop_shot_count', { fallback, min: 1, max: 8 });
  const count = stored === 8 ? 8 : 4;
  // Migrate legacy single-shot presets to complete four-shot groups.
  useEffect(() => {
    if (stored !== count) setStored(count);
  }, [stored, count, setStored]);
  const setCount = useCallback((value: number) => setStored(value === 8 ? 8 : 4), [setStored]);
  return [count, setCount] as const;
}
