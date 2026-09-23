/** A transport fallback may only replay read-only HTTP requests. */
export function mayReplayAfterTransportFailure(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}
