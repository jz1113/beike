/** Bridge legacy polling cancellation to fetch without abandoning saved submission keys. */
export async function withSalesAbort<T>(isAborted: () => boolean, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  if (isAborted()) controller.abort();
  const timer = setInterval(() => { if (isAborted()) controller.abort(); }, 100);
  try { return await run(controller.signal); } finally { clearInterval(timer); }
}
