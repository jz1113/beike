import { getTurnSnapshot } from './turns';

/** Recovery is read-only: preserve completed/failed/running state and normalized items. */
export async function recoverTurn(req: Request): Promise<Response> {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/\/recover$/, '/snapshot');
  return getTurnSnapshot(new Request(url, { headers: req.headers }));
}
