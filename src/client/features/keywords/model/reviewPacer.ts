export const MAX_REVIEW_CONCURRENCY = 12;

/** A finished batch this slow is near the client timeout, so concurrency stops climbing. */
export const SLOW_GATEWAY_BATCH_MS = 8 * 60_000;

/** Limits parallel requests and backs off when the selected provider rate limits a request. */
export class ReviewPacer {
  private active = 0;
  private limit: number;
  private successes = 0;
  private cooldownUntil = 0;
  private maxLimit: number;

  constructor(maxConcurrency = MAX_REVIEW_CONCURRENCY) {
    this.maxLimit = Math.min(MAX_REVIEW_CONCURRENCY, Math.max(1, Math.floor(maxConcurrency) || 1));
    this.limit = 1;
  }

  get concurrency(): number { return this.limit; }

  /** Leave time for the provider to recover between passes over unfinished rows. */
  async waitToRetry(round: number, shouldStop: () => boolean): Promise<boolean> {
    const delay = Math.min(60_000, 5_000 * 2 ** Math.min(4, Math.max(0, round - 1)));
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + delay);
    while (!shouldStop() && Date.now() < this.cooldownUntil) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(500, this.cooldownUntil - Date.now())));
    }
    return !shouldStop();
  }

  async acquire(shouldStop: () => boolean): Promise<boolean> {
    while (!shouldStop()) {
      const cooldown = this.cooldownUntil - Date.now();
      if (cooldown <= 0 && this.active < this.limit) {
        this.active += 1;
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(100, Math.min(500, cooldown))));
    }
    return false;
  }

  succeeded(): void {
    this.active -= 1;
    this.successes += 1;
    if (this.successes >= 1 && this.limit < this.maxLimit) {
      const doubled = this.limit * 2;
      this.limit = doubled > this.maxLimit ? this.maxLimit : doubled;
      this.successes = 0;
    }
  }

  failed(): void { this.active -= 1; }

  /** A 504/524 cuts the in-flight ceiling in half for the rest of this run. */
  timedOut(): void {
    this.active -= 1;
    this.lockCeiling(Math.floor(this.limit / 2));
  }

  /** A slow success must not climb back toward the original ceiling. Above two in flight, halve it. */
  succeededSlow(): void {
    this.active -= 1;
    this.lockCeiling(this.limit > 2 ? Math.floor(this.limit / 2) : this.limit);
  }

  rateLimited(retryNumber: number): void {
    this.active -= 1;
    this.limit = Math.max(1, Math.floor(this.limit / 2));
    this.successes = 0;
    const backoffMs = Math.min(15_000, 1_000 * 2 ** retryNumber);
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + backoffMs);
  }

  private lockCeiling(next: number): void {
    this.maxLimit = Math.max(1, Math.min(this.maxLimit, next));
    this.limit = Math.min(this.limit, this.maxLimit);
    this.successes = 0;
  }
}
