import { useEffect } from 'react';

/**
 * Locks scroll on a target container while `locked` is true.
 * Restores the previous overflow style on unlock/unmount.
 */
export function useScrollLock(locked: boolean, selector: string) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;

    const prevOverflow = el.style.overflow;
    el.style.overflow = 'hidden';

    return () => {
      el.style.overflow = prevOverflow;
    };
  }, [locked, selector]);
}
