import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStaleSubmittedTask, STALE_SUBMITTED_TASK_MS } from './taskRecoveryPolicy.ts';

test('unsubmitted or terminal tasks are not treated as stale submitted work', () => {
  const now = Date.now();
  assert.equal(isStaleSubmittedTask({ taskId: null, status: 'IN_PROGRESS', updatedAt: now - STALE_SUBMITTED_TASK_MS - 1 }, now), false);
  assert.equal(isStaleSubmittedTask({ taskId: 'cloud_1', status: 'SUCCESS', updatedAt: now - STALE_SUBMITTED_TASK_MS - 1 }, now), false);
});

test('submitted IN_PROGRESS tasks older than 20 minutes are stale', () => {
  const now = Date.now();
  assert.equal(isStaleSubmittedTask({ taskId: 'cloud_1', status: 'IN_PROGRESS', updatedAt: now - STALE_SUBMITTED_TASK_MS }, now), true);
  assert.equal(isStaleSubmittedTask({ taskId: 'cloud_1', status: 'IN_PROGRESS', updatedAt: now - 60_000 }, now), false);
  assert.equal(isStaleSubmittedTask({ taskId: 'cloud_1', status: 'PENDING', updatedAt: now - STALE_SUBMITTED_TASK_MS - 5_000 }, now), true);
});
