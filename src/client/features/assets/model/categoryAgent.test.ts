import { describe, expect, it } from 'vitest';
import { categorySkillStateSchema } from '@shared/contracts/categorySkills';
import { canAutoLearn, canConsolidate, categoryNextStep } from './categoryAgent';

function state() {
  return categorySkillStateSchema.parse({
    success: true,
    scope: { folderId: 'phone', autoAnalyze: true, autoPublish: false, minSamples: 20, activeVersionId: '', trialVersionId: '', comparisonVersionId: '', revision: 0, runningToken: '', runningAt: '', progress: 0, lastAttempt: '', error: '' },
    dataset: { folder: { id: 'phone', name: '手机', majorId: 'digital', majorName: '手机通讯' }, total: 20, excluded: 0, duplicates: 0, fingerprint: 'dataset', samples: [] },
    memory: { entries: [], notes: [], learned: 0, pending: 16, rejected: 0, holdout: 4, fingerprint: 'notes' },
    versions: [], events: [], validations: {}, pendingSamples: 16, feedbackCount: 0, feedbackChanged: false, memoryChanged: false, needsConsolidation: true, attemptFingerprint: 'input-v1', engineVersion: 'v2',
  });
}
describe('category agent learning controls', () => {
  it('runs at most one automatic round per unchanged input and never replays a failed call', () => {
    const s = state();
    expect(canAutoLearn(s)).toBe(true);
    s.scope.lastAttempt = s.attemptFingerprint;
    expect(canAutoLearn(s)).toBe(false);
    s.attemptFingerprint = 'input-v2';
    expect(canAutoLearn(s)).toBe(true);
    s.scope.error = '模型连接中断';
    expect(canAutoLearn(s)).toBe(false);
    s.scope.error = ''; s.scope.trialVersionId = 'candidate';
    expect(canAutoLearn(s)).toBe(false);
  });
  it('does not count incompatible pictures toward automatic consolidation', () => {
    const s = state();
    s.memory.pending = 15; s.memory.rejected = 1;
    expect(canAutoLearn(s)).toBe(false);
    expect(categoryNextStep(s).label).toBe('有新图可学');
    s.memory.pending = 0; s.memory.learned = 15;
    expect(categoryNextStep(s).label).toBe('积累参考');
  });
  it('requires observed training experience even with many validation pictures', () => {
    const s = state();
    s.memory.learned = 5; s.memory.holdout = 50;
    expect(canConsolidate(s)).toBe(false);
    s.memory.learned = 16;
    expect(canConsolidate(s)).toBe(true);
    s.memory.holdout = 2;
    expect(canConsolidate(s)).toBe(false);
  });
});
