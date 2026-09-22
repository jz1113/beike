import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeInvalidation, shouldInvalidateTarget } from './invalidation.ts';

test('product image changes invalidate storyboard, tasks and copywriting', () => {
  const effect = computeInvalidation({ type: 'product_images', productId: 'p1' });
  assert.equal(effect.collection, 'keep');
  assert.equal(effect.storyboard, 'all');
  assert.equal(effect.tasks, 'all');
  assert.equal(effect.copywriting, 'all');
});

test('single shot prompt edits only invalidate that shot', () => {
  const change = { type: 'shot_prompt', productId: 'p1', shotNo: 2 };
  const effect = computeInvalidation(change);
  assert.equal(effect.storyboard, 'shot');
  assert.equal(effect.tasks, 'shot');
  assert.equal(shouldInvalidateTarget(effect.tasks, { shotNo: 2, generated: true }, change), true);
  assert.equal(shouldInvalidateTarget(effect.tasks, { shotNo: 1, generated: true }, change), false);
});

test('generation param changes keep storyboards and only drop ungenerated tasks', () => {
  const change = { type: 'generation_params' };
  const effect = computeInvalidation(change);
  assert.equal(effect.storyboard, 'keep');
  assert.equal(effect.tasks, 'ungenerated');
  assert.equal(shouldInvalidateTarget(effect.tasks, { generated: true }, change), false);
  assert.equal(shouldInvalidateTarget(effect.tasks, { generated: false }, change), true);
});

test('concurrency changes invalidate nothing', () => {
  const effect = computeInvalidation({ type: 'concurrency' });
  assert.equal(effect.storyboard, 'keep');
  assert.equal(effect.tasks, 'keep');
  assert.equal(effect.copywriting, 'keep');
});

test('architecture and locked assets both rebuild storyboards', () => {
  assert.equal(computeInvalidation({ type: 'architecture' }).storyboard, 'all');
  assert.equal(computeInvalidation({ type: 'locked_assets' }).tasks, 'all');
  assert.equal(computeInvalidation({ type: 'shot_count' }).plan, 'update');
});
