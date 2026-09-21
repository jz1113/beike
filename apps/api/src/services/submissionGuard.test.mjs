import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isExpiredReceipt, SUBMISSION_RECEIPT_TTL_MS } from './submissionGuard.ts';

test('submission receipts expire after 24 hours', () => {
  const now = Date.now();
  assert.equal(isExpiredReceipt(now, now), false);
  assert.equal(isExpiredReceipt(now - SUBMISSION_RECEIPT_TTL_MS + 1, now), false);
  assert.equal(isExpiredReceipt(now - SUBMISSION_RECEIPT_TTL_MS, now), true);
  assert.equal(isExpiredReceipt(undefined, now), true);
});
