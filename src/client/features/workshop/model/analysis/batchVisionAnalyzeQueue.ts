import type { BatchProductItem } from '../batchTypes';

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
  const groups = new Map<string, Array<{ item: BatchProductItem; index: number }>>();
  opts.items.forEach((item, index) => {
    const key = `${item.platform === 'tmall' ? 'taobao' : item.platform}:${item.itemId}`;
    const group = groups.get(key) || [];
    group.push({ item, index }); groups.set(key, group);
  });
  const queue = [...groups.values()];
  let groupIndex = 0;
  const concurrency = Math.min(Math.max(1, Math.floor(opts.concurrency || 2)), 6, queue.length);

  const worker = async () => {
    while (groupIndex < queue.length && !opts.isAborted()) {
      const group = queue[groupIndex++];
      for (const { item, index: currentItemIdx } of group) {
      if (opts.isAborted()) break;
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
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return successAnalyzed;
}
