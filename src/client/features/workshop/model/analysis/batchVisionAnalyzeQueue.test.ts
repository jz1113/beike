import { expect, it, vi } from 'vitest';
import { runBatchVisionAnalyze } from './batchVisionAnalyzeQueue';
import { buildWorkshopTableItems, parseWorkshopTable } from '../collection/workshopTableImport';

it('analyzes same-SKU content sequentially while other products continue concurrently', async () => {
  const rows = parseWorkshopTable([['商品ID', '需要数量'], ['12345678', 3], ['87654321', 2]]).rows;
  const { items } = buildWorkshopTableItems(rows, []);
  const active = new Set<string>();
  const order: string[] = [];
  let maxActive = 0;
  const success = await runBatchVisionAnalyze({ items, concurrency: 3, isAborted: () => false,
    onItemStart: vi.fn(), onItemFinish: vi.fn(), onItemError: error => { throw error; },
    analyzeOne: async item => {
      expect(active.has(item.itemId)).toBe(false);
      active.add(item.itemId); maxActive = Math.max(maxActive, active.size);
      order.push(`${item.itemId}:${item.contentPlan?.index}`);
      await Promise.resolve(); active.delete(item.itemId); return true;
    },
  });
  expect(success).toBe(5); expect(maxActive).toBe(2);
  expect(order.filter(value => value.startsWith('12345678'))).toEqual(['12345678:1', '12345678:2', '12345678:3']);
});
