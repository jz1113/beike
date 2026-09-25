import { useCallback, useRef, useState, type SetStateAction } from 'react';
import type { BatchProductItem } from '../model/batchTypes';

/** Keep async pipeline readers current even before React commits the next render. */
export function useLiveItems() {
  const [items, commit] = useState<BatchProductItem[]>([]);
  const itemsRef = useRef(items);
  const setItems = useCallback((update: SetStateAction<BatchProductItem[]>) => {
    const next = typeof update === 'function' ? update(itemsRef.current) : update;
    itemsRef.current = next;
    commit(next);
  }, []);
  return { items, itemsRef, setItems };
}
