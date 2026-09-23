import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyBatchResults, countReviewRecords, isRecoverableModelOutputError, selectPreviewRecords, updateReviewRecords } from './reviewProgress.ts';

test('model output validation errors can be isolated without stopping the review', () => {
  assert.equal(isRecoverableModelOutputError(502, 'model_output_invalid'), true);
  assert.equal(isRecoverableModelOutputError(502, 'deepseek_api_error'), false);
  assert.equal(isRecoverableModelOutputError(500, 'deepseek_api_error'), false);
  assert.equal(isRecoverableModelOutputError(409), false);
});

test('large review updates only the active batch and keeps earlier results', () => {
  const records = Array.from({ length: 50_000 }, (_, index) => ({
    id: `row-${index}`,
    query: `词 ${index}`,
    status: 'idle',
  }));
  const indices = new Map(records.map((record, index) => [record.id, index]));
  const ids = Array.from({ length: 50 }, (_, offset) => `row-${8_000 + offset}`);
  const running = updateReviewRecords(records, indices, ids, (record) => ({ ...record, status: 'running' }));
  assert.equal(running[7_999], records[7_999]);
  assert.equal(running[8_000].status, 'running');
  const results = ids.map((id) => ({ id, category: '动物', producible: '制作', categoryReason: '动物相关内容', rejectReason: '' }));
  const done = applyBatchResults(running, indices, results);
  assert.equal(done[8_000].status, 'done');
  assert.equal(done[8_049].category, '动物');
  assert.equal(done[8_050], records[8_050]);
  assert.deepEqual(countReviewRecords(done), {
    total: 50_000, done: 50, failed: 0, pending: 49_950, producible: 50, rejected: 0,
  });
});

test('preview prioritizes running, failed and latest rows in source order', () => {
  const records = [
    { id: 'a', status: 'done' },
    { id: 'b', status: 'error' },
    { id: 'c', status: 'running' },
    { id: 'd', status: 'done' },
    { id: 'e', status: 'idle' },
  ];
  assert.deepEqual(selectPreviewRecords(records, new Set(['d']), 4).map((record) => record.id), ['c', 'b', 'd', 'a']);
});
