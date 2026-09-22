import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateQualityScore,
  emptyUsageCounts,
  shouldAutoDemote,
} from './scoring.ts';

test('low sample does not auto demote', () => {
  const counts = emptyUsageCounts();
  counts.submitted = 3;
  counts.failed = 3;
  assert.equal(shouldAutoDemote(counts, 20), false);
});

test('enough samples can demote high retry assets', () => {
  const counts = emptyUsageCounts();
  counts.submitted = 20;
  counts.succeeded = 16;
  counts.retried = 10;
  assert.equal(shouldAutoDemote(counts, 80), true);
});

test('quality score prefers review breakdown', () => {
  const counts = emptyUsageCounts();
  counts.submitted = 12;
  counts.succeeded = 10;
  counts.accepted = 8;
  const result = aggregateQualityScore({
    counts,
    breakdown: { productFidelity: 90, composition: 80, aesthetic: 70, consistency: 60 },
  });
  assert.ok(result.score != null && result.score > 70);
});
