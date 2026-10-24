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
  it('starts manually by default and only consolidates effective observations or notes', () => {
    const s = state();
    s.scope.autoAnalyze = false;
    expect(canAutoLearn(s)).toBe(false);
    s.memory.pending = 0; s.memory.rejected = 20; s.memory.holdout = 50;
    expect(canConsolidate(s)).toBe(false);
    expect(categoryNextStep(s).label).toBe('积累参考');
    s.memory.learned = 1;
    expect(canConsolidate(s)).toBe(true);
    expect(categoryNextStep(s).label).toBe('可以整理技能');
    s.memory.learned = 0;
    s.memory.notes.push({ id: 'note', kind: 'prefer', content: '保持自然光', createdAt: '' });
    expect(canConsolidate(s)).toBe(true);
  });
  it('uses one automatic round for newly added references when the user opted in', () => {
    const s = state();
    s.memory.pending = 1; s.needsConsolidation = false;
    s.versions.push({ id: 'v1', folderId: 'phone', parentVersionId: '', sourceFingerprint: 'old', promptSnippet: '规则', summary: '', model: 'vision', createdAt: '', manifest: { samples: [], feedbackFingerprint: '', ruleEvidence: [], memoryFingerprint: 'notes', engineVersion: 'v3' } });
    expect(canAutoLearn(s)).toBe(true);
    s.scope.lastAttempt = s.attemptFingerprint;
    expect(canAutoLearn(s)).toBe(false);
  });

});

import { filterParseLinkImages, toXhsQueueItems } from '@client/shared/utils/xhsLinkBatch';
import { organizeQueueIntoFourImageGroups } from '../hooks/deconstructQueueOps';

describe('four-image group automatic organization', () => {
  it('splits extracted notes into 4-image groups automatically', () => {
    const media = {
      title: '桌面手机实拍',
      author: 'tester',
      images: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg', '7.jpg', '8.jpg', '9.jpg'],
    };
    const filtered = filterParseLinkImages(media);
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) return;
    expect(filtered.images).toHaveLength(8);
    const items = toXhsQueueItems(filtered, 'https://www.xiaohongshu.com/explore/123', 0);
    expect(items).toHaveLength(2);
    expect(items[0].images).toEqual(['1.jpg', '2.jpg', '3.jpg', '4.jpg']);
    expect(items[0].name).toBe('桌面手机实拍 · 组 1');
    expect(items[1].images).toEqual(['5.jpg', '6.jpg', '7.jpg', '8.jpg']);
    expect(items[1].name).toBe('桌面手机实拍 · 组 2');
  });

  it('repacks modified or multi-group queue items into clean 4-image groups', () => {
    const organized = organizeQueueIntoFourImageGroups([
      {
        id: 'q1',
        name: '图集A',
        images: ['a1', 'a2', 'a3', 'a4'],
        excludedImageIndices: [3],
        status: 'pending',
      },
      {
        id: 'q2',
        name: '图集B',
        images: ['b1', 'b2', 'b3', 'b4', 'b5'],
        status: 'pending',
      },
    ]);
    expect(organized).toHaveLength(2);
    expect(organized.every((item) => item.images.length === 4)).toBe(true);
    expect(organized[0].images).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(organized[1].images).toEqual(['a1', 'a2', 'a3', 'b5']);
  });
});
