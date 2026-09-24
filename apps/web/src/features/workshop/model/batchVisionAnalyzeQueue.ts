import type { BatchProductItem } from './batchTypes';

export async function runBatchVisionAnalyze(opts: {
  items: BatchProductItem[];
  concurrency: number;
  isAborted: () => boolean;
  analyzeOne: (item: BatchProductItem, index: number) => Promise<boolean>;
  onItemStart: (item: BatchProductItem) => void;
  onItemFinish: (finished: number, total: number) => void;
  onItemError: (item: BatchProductItem, err: unknown) => void;
}): Promise<number> {
  let successAnalyzed = 0;
  let finishedCount = 0;
  let itemIdx = 0;
  const concurrency = Math.min(opts.concurrency || 16, opts.items.length);

  const worker = async () => {
    while (itemIdx < opts.items.length && !opts.isAborted()) {
      const currentItemIdx = itemIdx++;
      const item = opts.items[currentItemIdx];
      if (!item) break;
      opts.onItemStart(item);
      try {
        if (await opts.analyzeOne(item, currentItemIdx)) successAnalyzed++;
      } catch (err) {
        opts.onItemError(item, err);
      } finally {
        finishedCount++;
        opts.onItemFinish(finishedCount, opts.items.length);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return successAnalyzed;
}
