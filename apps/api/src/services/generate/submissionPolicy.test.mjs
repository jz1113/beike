import assert from 'node:assert/strict';
import test from 'node:test';
import { canTryAnotherSubmissionEndpoint } from './submissionPolicy.ts';

test('image and video submission only try another endpoint after a definite rejection', () => {
  for (const status of [404, 405, 415]) assert.equal(canTryAnotherSubmissionEndpoint(status), true);
  for (const status of [200, 400, 401, 429, 500, 502, 503, 504]) {
    assert.equal(canTryAnotherSubmissionEndpoint(status), false);
  }
});
