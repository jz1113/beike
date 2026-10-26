import { useCallback, useEffect, useMemo, useState } from 'react';

/** Selection can only act on items visible in the current filter and project. */
export function useMaterialSelection(items: { id: string }[], scope: string) {
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({ scope, ids: [] });
  const available = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const ids = useMemo(() => selection.scope === scope ? selection.ids.filter((id) => available.has(id)) : [], [selection, scope, available]);

  useEffect(() => {
    setSelection((previous) => {
      const next = previous.scope === scope ? previous.ids.filter((id) => available.has(id)) : [];
      return previous.scope === scope && next.length === previous.ids.length ? previous : { scope, ids: next };
    });
  }, [scope, available]);

  const clear = useCallback(() => setSelection({ scope, ids: [] }), [scope]);
  const toggle = useCallback((id: string, event?: { stopPropagation: () => void }) => {
    event?.stopPropagation();
    if (!available.has(id)) return;
    setSelection((previous) => {
      const current = previous.scope === scope ? previous.ids.filter((key) => available.has(key)) : [];
      return { scope, ids: current.includes(id) ? current.filter((key) => key !== id) : [...current, id] };
    });
  }, [scope, available]);
  const toggleAll = useCallback(() => {
    setSelection((previous) => ({ scope, ids: previous.scope === scope && available.size > 0 && [...available].every((id) => previous.ids.includes(id)) ? [] : [...available] }));
  }, [scope, available]);

  return { ids, clear, toggle, toggleAll };
}
