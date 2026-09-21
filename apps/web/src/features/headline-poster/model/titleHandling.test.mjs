import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitleHandling, preservedOriginalTitle, shouldRewriteCoverTitle } from './posterTypes.ts';

const item = { originalTitle: ' 真我 GT8 Pro 托尼优缺点总结！ ', coverTitle: '优缺点一次说清', isTitleEdited: false };

test('original title mode preserves the imported title and skips rewriting', () => {
  assert.equal(normalizeTitleHandling('original'), 'original');
  assert.equal(shouldRewriteCoverTitle(item, 'original'), false);
  assert.equal(preservedOriginalTitle(item), '真我 GT8 Pro 托尼优缺点总结！');
});

test('manual title edits take precedence over automatic rewriting', () => {
  assert.equal(shouldRewriteCoverTitle({ ...item, isTitleEdited: true }, 'rewrite'), false);
  assert.equal(normalizeTitleHandling('unexpected'), 'rewrite');
});
