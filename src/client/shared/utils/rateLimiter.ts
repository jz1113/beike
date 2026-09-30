/**
 * 高精度滑动窗口与令牌桶速率限制器 (RateLimiter)
 * 用于对有严格 QPS 限制的第三方接口（如 APIA: 10 QPS）进行平滑流量调度，
 * 彻底防止触发 429 频控报错，同时最大化接口吞吐带宽。
 */
export class RateLimiter {
  private targetQps: number;
  private minIntervalMs: number;
  private lastRequestTime = 0;
  private queue: Array<() => void> = [];
  private isProcessing = false;
  private backoffUntil = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(targetQps = 8.5) {
    this.targetQps = Math.max(0.1, targetQps);
    // 将请求平滑间隔打散（例如 8.5 QPS -> 每隔 ~118ms 释放一个请求）
    this.minIntervalMs = Math.ceil(1000 / this.targetQps);
  }

  /**
   * 触发自适应退避降频（例如收到上游 429 时调用）
   * @param delayMs 冷却等待时间（毫秒）
   */
  public triggerBackoff(delayMs = 1200): void {
    this.backoffUntil = Math.max(this.backoffUntil, Date.now() + delayMs);
  }

  /**
   * 获取通行令牌（异步等待直到符合 QPS 限制）
   */
  public async acquire(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
      const release = () => {
        signal?.removeEventListener('abort', cancel);
        resolve();
      };
      const cancel = () => {
        const index = this.queue.indexOf(release);
        if (index >= 0) this.queue.splice(index, 1);
        if (this.queue.length === 0 && this.timer !== null) {
          clearTimeout(this.timer);
          this.timer = null;
          this.isProcessing = false;
        }
        signal?.removeEventListener('abort', cancel);
        reject(signal?.reason || new DOMException('请求已取消', 'AbortError'));
      };
      signal?.addEventListener('abort', cancel, { once: true });
      this.queue.push(release);
      this.processQueue();
    });
  }

  /**
   * 使用限流器包装并执行异步任务
   */
  public async schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    signal?.throwIfAborted();
    return task();
  }

  private processQueue(): void {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const executeNext = () => {
      this.timer = null;
      if (this.queue.length === 0) {
        this.isProcessing = false;
        return;
      }

      const now = Date.now();
      const waitBackoff = Math.max(0, this.backoffUntil - now);
      const waitInterval = Math.max(0, this.lastRequestTime + this.minIntervalMs - now);
      const waitTime = Math.max(waitBackoff, waitInterval);

      if (waitTime > 0) {
        this.timer = setTimeout(executeNext, waitTime);
        return;
      }

      this.lastRequestTime = Date.now();
      const nextResolve = this.queue.shift();
      if (nextResolve) {
        nextResolve();
      }

      if (this.queue.length > 0) {
        this.timer = setTimeout(executeNext, this.minIntervalMs);
      } else {
        this.isProcessing = false;
      }
    };

    executeNext();
  }
}
