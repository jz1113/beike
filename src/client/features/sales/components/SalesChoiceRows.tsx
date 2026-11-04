import { useEffect, useRef, useState, type ReactNode } from 'react';

const PAGE_SIZE = 24;

/** Append options as the user scrolls a material menu; the button also supports keyboard navigation. */
export function SalesChoiceRows<T>({ items, children }: { items: readonly T[]; children: (item: T) => ReactNode }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const moreRef = useRef<HTMLButtonElement>(null);
  const lastBeforeAppend = useRef<Element | null>(null);
  useEffect(() => {
    const next = lastBeforeAppend.current?.nextElementSibling;
    if (next instanceof HTMLButtonElement) next.focus();
    lastBeforeAppend.current = null;
  }, [limit]);
  useEffect(() => {
    const more = moreRef.current;
    if (!more || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && document.activeElement !== more) setLimit(limit + PAGE_SIZE);
    }, { root: more.closest('.sales-dropup-list'), rootMargin: '0px 0px 80px' });
    observer.observe(more);
    return () => observer.disconnect();
  }, [limit, items.length]);

  return <>
    {items.slice(0, limit).map(children)}
    {limit < items.length && <button type="button" ref={moreRef} className="sales-link-btn"
      onClick={() => {
        lastBeforeAppend.current = moreRef.current?.previousElementSibling ?? null;
        setLimit(limit + PAGE_SIZE);
      }}>显示更多选项</button>}
  </>;
}
