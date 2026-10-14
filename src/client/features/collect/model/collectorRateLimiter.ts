import { RateLimiter } from '@client/shared/utils/rateLimiter';

const collectorRateLimiter = new RateLimiter(8.5);

/** Single and batch collection share the upstream's rate and backoff budget. */
export function getCollectorRateLimiter(): RateLimiter {
  return collectorRateLimiter;
}
