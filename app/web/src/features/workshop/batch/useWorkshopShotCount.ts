import { useState, useEffect, useCallback } from 'react';
import { restoreStoredStoryboardPreset } from '@beike/shared/prompt-engine/storyboardPreset';
import { usePersistentNumber } from '@/lib/usePersistentState';

export function useWorkshopShotCount() {
  const [fallback] = useState(() => {
    try {
      return restoreStoredStoryboardPreset()?.shotCount === 1 ? 1 : 4;
    } catch {
      return 4;
    }
  });
  const [stored, setStored] = usePersistentNumber('workshop_shot_count', { fallback, min: 1, max: 8 });
  const count = stored === 1 ? 1 : 4;
  // Migrate legacy 2/3/5–8 shot settings to the supported four-shot preset.
  useEffect(() => {
    if (stored !== count) setStored(count);
  }, [stored, count, setStored]);
  const setCount = useCallback((value: number) => setStored(value === 1 ? 1 : 4), [setStored]);
  return [count, setCount] as const;
}
