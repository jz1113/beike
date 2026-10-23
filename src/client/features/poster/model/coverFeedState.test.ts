import { describe, expect, it } from 'vitest';
import { canStartCoverFeed, coverFeedPhase, reconcileCoverFeedJob } from './coverFeedState';
import type { CoverMemorySample } from '@shared/contracts/coverMemory';

const sample = (patch: Partial<CoverMemorySample>): CoverMemorySample => ({
  id: 'sample-1', title: '封面', imageUrls: ['https://cdn.example/a.jpg'], model: 'gemini', status: 'completed', error: '', createdAt: '2026-01-02T00:00:00Z', ...patch,
});

describe('cover feed state', () => {
  it('blocks a second submission while work is running', () => {
    expect(canStartCoverFeed(['queued', 'analyzing'])).toBe(false);
    expect(canStartCoverFeed(['failed'])).toBe(true);
    expect(coverFeedPhase(['done', 'failed'], false)).toBe('partial');
  });

  it('matches an uncertain result instead of submitting it again', () => {
    const job = { id: 'job-1', status: 'uncertain' as const, url: 'https://cdn.example/a.jpg' };
    expect(reconcileCoverFeedJob(job, [sample({})], '2026-01-01T00:00:00Z').status).toBe('done');
    expect(reconcileCoverFeedJob(job, [sample({ status: 'failed', error: '模型失败' })], '2026-01-01T00:00:00Z')).toMatchObject({ status: 'failed', error: '模型失败' });
    expect(reconcileCoverFeedJob(job, [], '2026-01-01T00:00:00Z').status).toBe('uncertain');
  });
});
