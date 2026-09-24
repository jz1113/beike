import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCollectItemId, identifyCollectPlatform } from './collectProduct.ts';

test('identifies the storefront from a product url', () => {
  assert.equal(identifyCollectPlatform('auto', 'https://item.jd.com/100012043978.html'), 'jd');
  assert.equal(identifyCollectPlatform('auto', 'https://detail.tmall.com/item.htm?id=1234567890'), 'taobao');
  assert.equal(identifyCollectPlatform('auto', 'https://detail.1688.com/offer/654321.html'), '1688');
  assert.equal(identifyCollectPlatform('auto', 'https://mobile.yangkeduo.com/goods.html?goods_id=99887766'), 'pinduoduo');
  assert.equal(identifyCollectPlatform('jd', 'not-a-url'), 'jd');
});

test('extracts the numeric item id from a detail link', () => {
  assert.equal(extractCollectItemId('https://item.jd.com/100012043978.html'), '100012043978');
  assert.equal(extractCollectItemId('100012043978'), '100012043978');
});
