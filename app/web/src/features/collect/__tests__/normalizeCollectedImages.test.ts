import { expect, it } from 'vitest';
import { normalizeCollectedImages } from '../normalizeCollectedImages';
it('preserves field priority and first occurrence ordering', () => {
  expect(normalizeCollectedImages({ product: { mainImages: ['a'], images: ['unused'], skuImages: ['a','b'], descImages: ['c'] } }))
    .toEqual({ mainImgs:['a'],skuImgs:['a','b'],descImgs:['c'],allImgs:['a','b','c'],coverImg:'a' });
});
it('ignores malformed arrays and falls back to legacy response fields', () => {
  expect(normalizeCollectedImages({product:{ mainImages:[null,42],coverImage:7 },images:{main:['old'],skus:'bad'}}))
    .toEqual({mainImgs:['old'],skuImgs:[],descImgs:[],allImgs:['old'],coverImg:'old'});
  expect(normalizeCollectedImages({}).allImgs).toEqual([]);
});
