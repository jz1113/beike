interface TestHookRuntime {
  index: number;
  slots: unknown[];
  pending: (() => void)[];
  cleanups: Map<number, () => void>;
}

/** Minimal deterministic hook runtime used by the production workflow tests. */
export function salesProductionTestHooks(hooks: TestHookRuntime) {
  const same = (left: unknown[] | undefined, right: unknown[]) => left?.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const memo = (create: () => unknown, deps: unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as { deps: unknown[]; value: unknown } | undefined;
    if (!previous || !same(previous.deps, deps)) hooks.slots[index] = { deps, value: create() };
    return (hooks.slots[index] as { value: unknown }).value;
  };
  return {
    useCallback: (fn: unknown, deps: unknown[]) => memo(() => fn, deps),
    useMemo: memo,
    useEffect: (fn: () => (() => void) | undefined, deps: unknown[]) => {
      const index = hooks.index++;
      if (same(hooks.slots[index] as unknown[] | undefined, deps)) return;
      hooks.slots[index] = deps;
      hooks.pending.push(() => {
        hooks.cleanups.get(index)?.();
        hooks.cleanups.delete(index);
        const cleanup = fn();
        if (cleanup) hooks.cleanups.set(index, cleanup);
      });
    },
    useRef: (initial: unknown) => {
      const index = hooks.index++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
    useState: <T>(initial: T | (() => T)) => {
      const index = hooks.index++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
        hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
      }];
    },
  };
}
