import assert from 'node:assert/strict';
import test from 'node:test';
import { mayReplayAfterTransportFailure } from './requestReplay.ts';

test('transport fallback cannot replay model submissions', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(mayReplayAfterTransportFailure(method), false);
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(mayReplayAfterTransportFailure(method), true);
  }
});
