import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imageGenBusinessError, isTransientPollError } from './generationErrors.ts';
import {
  GENERATION_CANCELLED_MESSAGE,
  isGenerationCancelled,
  sleepWhilePolling,
  throwIfGenerationAborted,
} from './generationAbort.ts';

test('throwIfGenerationAborted throws a non-transient business error', () => {
  assert.throws(
    () => throwIfGenerationAborted(() => true),
    (error) => error instanceof Error && error.message === GENERATION_CANCELLED_MESSAGE && !isTransientPollError(error),
  );
  assert.doesNotThrow(() => throwIfGenerationAborted(() => false));
});

test('sleepWhilePolling stops immediately when aborted', async () => {
  const started = Date.now();
  await assert.rejects(
    () => sleepWhilePolling(5000, () => true),
    (error) => error instanceof Error && error.message === GENERATION_CANCELLED_MESSAGE,
  );
  assert.ok(Date.now() - started < 500);
});

test('isGenerationCancelled recognizes abort signals and cancel errors', () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal(isGenerationCancelled(null, controller.signal), true);
  assert.equal(isGenerationCancelled(imageGenBusinessError(GENERATION_CANCELLED_MESSAGE)), true);
  assert.equal(isGenerationCancelled(new Error('网络连接异常')), false);
});
