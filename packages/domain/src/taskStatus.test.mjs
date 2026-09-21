import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fromAssistantTurnStatus,
  fromImageTaskStatus,
  isCanonicalTerminal,
  isImageTaskActive,
  isImageTaskTerminal,
  toImageTaskStatus,
  toUiGenerationStatus,
} from './taskStatus.ts';

test('maps ImageTask PENDING/IN_PROGRESS/SUCCESS/FAILURE to canonical statuses', () => {
  assert.equal(fromImageTaskStatus('PENDING'), 'queued');
  assert.equal(fromImageTaskStatus('IN_PROGRESS'), 'running');
  assert.equal(fromImageTaskStatus('SUCCESS'), 'succeeded');
  assert.equal(fromImageTaskStatus('FAILURE'), 'failed');
  assert.equal(fromImageTaskStatus('CANCELLED'), 'cancelled');
});

test('round-trips canonical statuses back to ImageTask wire values', () => {
  assert.equal(toImageTaskStatus('queued'), 'PENDING');
  assert.equal(toImageTaskStatus('running'), 'IN_PROGRESS');
  assert.equal(toImageTaskStatus('succeeded'), 'SUCCESS');
  assert.equal(toImageTaskStatus('failed'), 'FAILURE');
  assert.equal(toImageTaskStatus('cancelled'), 'CANCELLED');
  assert.equal(toImageTaskStatus('expired'), 'CANCELLED');
});

test('maps assistant turn statuses without changing Prisma enums', () => {
  assert.equal(fromAssistantTurnStatus('running'), 'running');
  assert.equal(fromAssistantTurnStatus('completed'), 'succeeded');
  assert.equal(fromAssistantTurnStatus('interrupted'), 'cancelled');
  assert.equal(fromAssistantTurnStatus('awaiting_approval'), 'running');
  assert.equal(fromAssistantTurnStatus('failed'), 'failed');
});

test('treats succeeded/failed/cancelled/expired as terminal', () => {
  assert.equal(isCanonicalTerminal('succeeded'), true);
  assert.equal(isCanonicalTerminal('queued'), false);
  assert.equal(isImageTaskTerminal('SUCCESS'), true);
  assert.equal(isImageTaskTerminal('IN_PROGRESS'), false);
});

test('maps PENDING and IDLE to the same UI queued status', () => {
  assert.equal(toUiGenerationStatus('PENDING'), 'IDLE');
  assert.equal(toUiGenerationStatus('IDLE'), 'IDLE');
  assert.equal(toUiGenerationStatus('IN_PROGRESS'), 'IN_PROGRESS');
  assert.equal(isImageTaskActive('PENDING'), true);
  assert.equal(isImageTaskActive('IDLE'), true);
  assert.equal(isImageTaskActive('SUCCESS'), false);
});
