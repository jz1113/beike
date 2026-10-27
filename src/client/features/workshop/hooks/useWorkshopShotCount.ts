import { useState, useCallback } from 'react';

export function useWorkshopShotCount() {
  const [count, setStored] = useState(4);
  const setCount = useCallback((value: number) => setStored(value === 8 ? 8 : 4), []);
  return [count, setCount] as const;
}
