import { waitWhilePaused } from '@/shared/api/generationAbort';
import type { BatchProductItem } from './batchTypes';

/** 批量生图队列 worker 池（按商品并发） */
export async function runBatchGenerationWorkers(opts: {
  items: BatchProductItem[];
  concurrency: number;
  isAborted: () => boolean;
  isPaused?: () => boolean;
  generateItem: (item: BatchProductItem) => Promise<void>;
}): Promise<void> {
  let itemIdx = 0;
  const concurrency = Math.min(opts.concurrency || 4, opts.items.length);

  const worker = async () => {
    while (itemIdx < opts.items.length && !opts.isAborted()) {
      if (opts.isPaused) await waitWhilePaused(opts.isPaused, opts.isAborted);
      if (opts.isAborted()) break;
      const currentItem = opts.items[itemIdx++];
      if (!currentItem) break;
      await opts.generateItem(currentItem);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

/** 失败分镜重试 worker 池 */
export async function runRetryFailedGenerationWorkers(opts: {
  items: BatchProductItem[];
  concurrency: number;
  isAborted: () => boolean;
  isPaused?: () => boolean;
  retryItem: (item: BatchProductItem) => Promise<void>;
}): Promise<void> {
  let itemIdx = 0;
  const concurrency = Math.min(opts.concurrency || 4, opts.items.length);

  const worker = async () => {
    while (itemIdx < opts.items.length && !opts.isAborted()) {
      if (opts.isPaused) await waitWhilePaused(opts.isPaused, opts.isAborted);
      if (opts.isAborted()) break;
      const currentItem = opts.items[itemIdx++];
      if (!currentItem) break;
      await opts.retryItem(currentItem);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
