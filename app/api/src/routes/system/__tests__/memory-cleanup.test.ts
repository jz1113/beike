import { describe, expect, it } from 'vitest';
import * as memoryCleanup from '../memory-cleanup';
import { checkpointDatabase } from '@beike/server-kit/prisma';

describe('memory-cleanup system route', () => {
  it('successfully executes memory cleanup and returns metrics', async () => {
    const res = await memoryCleanup.POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.before).toBeDefined();
    expect(json.after).toBeDefined();
    expect(typeof json.freedBytes).toBe('number');
    expect(json.walResult).toBeDefined();
  });

  it('checkpointDatabase runs without throwing', async () => {
    const res = await checkpointDatabase();
    // In SQLite, checkpoint returns { busy, log, checkpointed } or null
    if (res) {
      expect(typeof res.checkpointed).toBe('number');
    }
  });
});
