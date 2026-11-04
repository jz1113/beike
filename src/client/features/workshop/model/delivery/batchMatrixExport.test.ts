import { describe, expect, it } from 'vitest';
import type { BatchProductItem, BatchTaskItem } from '../batchTypes';
import { buildMatrixExportRows } from './batchMatrixExport';

function product(shots: number[], excluded?: number): BatchProductItem {
  const tasks: BatchTaskItem[] = shots.map(shot_no => ({
    id: String(shot_no), shot_no, title: '', prompt: '', status: 'SUCCESS',
    resultUrl: `https://example.com/image-${shot_no}.jpg`,
    outputReview: shot_no === excluded ? 'rejected' : 'accepted',
  }));
  return { id: 'content', itemId: '12345678', title: '商品', platform: 'jd', price: 0, category: '',
    brand: '', coverImage: '', mainImages: [], detailImages: [], skuImages: [], props: {}, status: 'success',
    selected: true, selectedProductImages: [], allTypedImages: [], prompts: [], tasks };
}

describe('workshop delivery sheet', () => {
  it('preserves four-shot headers and extends mixed batches without shifting excluded shots', async () => {
    const four = product([1, 2, 3, 4]);
    const [legacy] = await buildMatrixExportRows([four], undefined, { allowUpload: false });
    expect(legacy).not.toHaveProperty('生成图片链接5');
    const [short, extended] = await buildMatrixExportRows([four, product([1, 5, 8], 5)], undefined, { allowUpload: false });
    expect(Object.keys(short)).toEqual(Object.keys(extended));
    expect(extended['生成图片链接5']).toBe('');
    expect(extended['生成图片链接8']).toBe('https://example.com/image-8.jpg');
    expect(Object.keys(extended).indexOf('生成图片链接8')).toBeLessThan(Object.keys(extended).indexOf('标题'));
  });
});
