import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyGenerationPollResult, imageGenBusinessError, isTransientPollError, accumulateTransientPollFailure, MAX_TRANSIENT_POLL_FAILURES } from './generationErrors.ts';

test('business FAILURE is classified immediately, PENDING stays pending', () => {
  assert.equal(classifyGenerationPollResult({ status: 'PENDING' }), 'pending');
  assert.equal(classifyGenerationPollResult({ status: 'IDLE' }), 'pending');
  assert.equal(classifyGenerationPollResult({ status: 'IN_PROGRESS' }), 'pending');
  assert.equal(classifyGenerationPollResult({ status: 'FAILURE', failReason: '内容审核未通过' }), 'failure');
  assert.equal(classifyGenerationPollResult({ status: 'SUCCESS', resultUrl: 'https://example.com/a.jpg' }), 'success');
});

test('transient poll errors are retryable, business errors are not', () => {
  assert.equal(isTransientPollError(new Error('Failed to fetch')), true);
  assert.equal(isTransientPollError(imageGenBusinessError('内容审核未通过')), false);
});

test('transient poll failures retry until the consecutive limit', () => {
  const counts = {};
  assert.equal(accumulateTransientPollFailure(counts, 't1'), false);
  assert.equal(accumulateTransientPollFailure(counts, 't1'), false);
  assert.equal(accumulateTransientPollFailure(counts, 't1'), true);
  assert.equal(MAX_TRANSIENT_POLL_FAILURES, 3);
  assert.equal(counts.t1, undefined);
});
