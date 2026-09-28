/** Coalesce partial snapshots without dropping fields or delaying final state. */
export function createStreamPatchBatcher<T extends object>(commit: (patch: Partial<T>) => void, delay = 32) {
  let pending: Partial<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const patch = pending;
    pending = null;
    if (patch) commit(patch);
  };
  return {
    push(patch: Partial<T>) {
      pending = {...pending, ...patch};
      if (timer === undefined) timer = setTimeout(flush, delay);
    },
    flush,
  };
}
