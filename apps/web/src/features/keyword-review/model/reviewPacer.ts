export const MAX_REVIEW_CONCURRENCY = 12;

/** Limits parallel requests and backs off when DeepSeek rejects a request for rate limiting. */
export class ReviewPacer {
  private active = 0;
  private limit = 4;
  private successes = 0;
  private cooldownUntil = 0;

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
    if (this.successes >= this.limit * 2 && this.limit < MAX_REVIEW_CONCURRENCY) {
      this.limit += 1;
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
