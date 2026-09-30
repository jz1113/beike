import { getTurnSnapshot } from './turns';

/** Read-only recovery preserves live workers and terminal history, and normalizes orphaned work after restart. */
export async function recoverTurn(req: Request): Promise<Response> {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/\/recover$/, '/snapshot');
  return getTurnSnapshot(new Request(url, { headers: req.headers }));
}
