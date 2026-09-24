import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildImageTaskKey, resolveTaskMergeAction, stableHash } from './idempotency.ts';

const base = {
  batchId: 'batch_1',
  productId: 'p1',
  storyboardRevision: 3,
  shotNo: 2,
  prompt: 'a porcelain hairpin on silk',
  selectedImageUrls: ['https://img/b.jpg', 'https://img/a.jpg'],
  model: 'gpt-image-2',
  aspectRatio: '3:4',
  quality: 'high',
};

test('task keys are stable across selected image order and prompt whitespace', () => {
  const first = buildImageTaskKey(base);
  const second = buildImageTaskKey({
    ...base,
    prompt: '  a porcelain hairpin   on silk ',
    selectedImageUrls: ['https://img/a.jpg', 'https://img/b.jpg'],
  });
  assert.equal(first, second);
});

test('changing prompt, model or revision produces a new key', () => {
  const original = buildImageTaskKey(base);
  assert.notEqual(buildImageTaskKey({ ...base, prompt: 'different' }), original);
  assert.notEqual(buildImageTaskKey({ ...base, model: 'other' }), original);
  assert.notEqual(buildImageTaskKey({ ...base, storyboardRevision: 4 }), original);
});

test('stableHash is deterministic', () => {
  assert.equal(stableHash('hello'), stableHash('hello'));
  assert.notEqual(stableHash('hello'), stableHash('world'));
});

test('retry attempt changes the idempotency key', () => {
  const original = buildImageTaskKey(base);
  assert.equal(buildImageTaskKey({ ...base, attempt: 0 }), original);
  assert.notEqual(buildImageTaskKey({ ...base, attempt: 1 }), original);
  assert.equal(buildImageTaskKey({ ...base, attempt: 2 }).endsWith(':a2'), true);
});

test('merge action reuses success, attaches running, recreates failure', () => {
  assert.equal(resolveTaskMergeAction(undefined), 'create');
  assert.equal(resolveTaskMergeAction({ key: 'k', status: 'SUCCESS' }), 'reuse_success');
  assert.equal(resolveTaskMergeAction({ key: 'k', status: 'IN_PROGRESS' }), 'attach_running');
  assert.equal(resolveTaskMergeAction({ key: 'k', status: 'PENDING' }), 'attach_running');
  assert.equal(resolveTaskMergeAction({ key: 'k', status: 'FAILURE' }), 'create');
});
