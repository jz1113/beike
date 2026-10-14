export const MAX_REVIEW_CONCURRENCY = 12;

/** Limits parallel requests and backs off when the selected provider rate limits a request. */
export class ReviewPacer {
  private active = 0;
  private limit: number;
  private successes = 0;
  private cooldownUntil = 0;
  private readonly maxLimit: number;

  constructor(maxConcurrency = MAX_REVIEW_CONCURRENCY) {
    this.maxLimit = Math.min(MAX_REVIEW_CONCURRENCY, Math.max(1, Math.floor(maxConcurrency) || 1));
    this.limit = 1;
  }

  get concurrency(): number { return this.limit; }

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

  rateLimited(retryNumber: number): void {
    this.active -= 1;
    this.limit = Math.max(1, Math.floor(this.limit / 2));
    this.successes = 0;
    const backoffMs = Math.min(15_000, 1_000 * 2 ** retryNumber);
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + backoffMs);
  }
}
