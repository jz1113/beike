import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WorkshopBatchConflict, WorkshopBatchNotFound } from '../services/workshopBatches.ts';

describe('workshop batch repository errors', () => {
  it('exposes conflict and not-found as typed errors', () => {
    assert.equal(new WorkshopBatchNotFound().name, 'Error');
    assert.ok(new WorkshopBatchConflict() instanceof Error);
    assert.ok(new WorkshopBatchNotFound() instanceof Error);
  });
});
