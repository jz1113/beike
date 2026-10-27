import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { categorySkillStateSchema } from '@shared/contracts/categorySkills';
import { categoryReadCount } from '../../model/categoryAgent';
import { CategoryLearningSummary } from './CategoryLearningSummary';
import { CategoryMemoryView } from './CategoryMemoryView';

function state() {
  return categorySkillStateSchema.parse({
    success: true,
    scope: { folderId: 'phone', autoAnalyze: false, autoPublish: false, minSamples: 1, activeVersionId: '', trialVersionId: '', comparisonVersionId: '', revision: 0, runningToken: '', runningAt: '', progress: 0, lastAttempt: '', error: '' },
    dataset: { folder: { id: 'phone', name: '手机', majorId: 'digital', majorName: '手机通讯' }, total: 27, excluded: 0, duplicates: 0, fingerprint: 'dataset', samples: [] },
    memory: {
      entries: Array.from({ length: 27 }, (_, i) => ({ groupId: `g${i}`, title: `手机 ${i}`, state: i < 5 ? 'learned' : 'pending', reason: '', rules: [], conditions: [], avoid: [], model: '', createdAt: '' })),
      notes: [{ id: 'n1', kind: 'prefer', content: '自然光', createdAt: '' }],
      learned: 5, pending: 22, rejected: 0, holdout: 0, fingerprint: 'notes',
    },
    versions: [], events: [], validations: {}, pendingSamples: 22, feedbackCount: 0, feedbackChanged: false, memoryChanged: false, needsConsolidation: true, attemptFingerprint: 'input', engineVersion: 'v3',
  });
}

function summary(s = state(), maxNewSamples = 5) {
  return renderToStaticMarkup(createElement(CategoryLearningSummary, { state: s, maxNewSamples })).replace(/<[^>]+>/g, '');
}

describe('类目读图数量', () => {
  it('separates 27 total groups, 5 learned groups, 22 pending groups and manual notes', () => {
    const text = summary();
    expect(text).toContain('图组总数27 组');
    expect(text).toContain('已记住5 组');
    expect(text).toContain('待读图22 组');
    expect(text).toContain('手动经验1 条');
    expect(text).toContain('本轮最多读取 5 组（20 张原图）');
    expect(text).toContain('其余待处理组需手动开始下一轮');
    expect(text).toContain('本轮只处理新增或需要补齐的组');
    expect(text).toContain('成功观察且原图、反推词、学习指令都未变的组会直接复用');
  });

  it('caps the actual round at the remaining count, including the final round', () => {
    const s = state();
    expect(categoryReadCount(s, 30)).toBe(22);
    expect(summary(s, 30)).toContain('本轮最多读取 22 组（88 张原图）');
    expect(summary(s, 30)).not.toContain('需继续下一轮');
    s.memory.pending = 2;
    expect(categoryReadCount(s, 5)).toBe(2);
    s.memory.pending = 0;
    expect(categoryReadCount(s, 5)).toBe(0);
    expect(summary(s)).toContain('当前没有待处理图组');
    expect(summary(s)).toContain('不会无限重跑');
  });

  it('explains every group outside the pending and learned counts without counting notes as groups', () => {
    const s = state();
    s.memory.pending = 14;
    s.memory.rejected = 2;
    s.memory.holdout = 1;
    s.dataset.excluded = 3;
    s.dataset.duplicates = 2;
    const text = summary(s);
    expect(text).toContain('图组总数27 组');
    expect(text).toContain('读图后不适用2 组');
    expect(text).toContain('独立验证1 组');
    expect(text).toContain('重复来源2 组');
    expect(text).toContain('未纳入学习3 组');
  });

  it('shows the full list count and pagination independently of the learned count', () => {
    const text = renderToStaticMarkup(createElement(CategoryMemoryView, {
      memory: state().memory, busy: false, onPreview: () => {}, onRun: async () => true,
    })).replace(/<[^>]+>/g, '');
    expect(text).toContain('全部状态（27）');
    expect(text).toContain('已记住（5）');
    expect(text).toContain('待读图（22）');
    expect(text).toContain('显示 12 / 27 组');
    expect(text).toContain('查看更多 · 还有 15 组');
  });
});
