import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapDbTaskToGenerationTask } from './mapDbTask.ts';

test('maps DB PENDING to UI IDLE so queued tasks stay pollable', () => {
  const mapped = mapDbTaskToGenerationTask({
    id: 'db-1',
    taskId: 'upstream-1',
    prompt: '白底商品图',
    status: 'PENDING',
    model: 'gpt-image-2',
    createdAt: 1,
  });
  assert.equal(mapped.status, 'IDLE');
  assert.equal(mapped.taskId, 'upstream-1');
  assert.equal(mapped.progress, '65%');
});

test('maps SUCCESS with resultUrl and treats missing status plus result as success', () => {
  const mapped = mapDbTaskToGenerationTask({
    id: 'db-2',
    prompt: '成图',
    resultUrl: 'https://example.com/a.jpg',
    createdAt: 1,
  });
  assert.equal(mapped.status, 'SUCCESS');
  assert.equal(mapped.resultUrl, 'https://example.com/a.jpg');
});
