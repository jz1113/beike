import { describe, expect, it } from 'vitest';
import { buildDesignPlan, type PosterItem } from './posterTypes';
import { COVER_FORMATS } from './coverFormat';
import { editedPosterInput, posterQueue, posterWorkflowCounts } from './posterWorkflow';
const base: PosterItem = { id: 'a', sourceImageUrl: 'https://example.com/a.jpg', originalTitle: '相机日常记录', coverTitle: '相机日常记录', productName: '', format: COVER_FORMATS.portrait, status: 'idle' };
const ready: PosterItem = { ...base, id: 'ready', prompt: '独立提示词', designPlan: buildDesignPlan(base.coverTitle, { title: base.coverTitle, titleLines: [base.coverTitle], imagePrompt: '独立提示词' }) };
describe('poster staged workflow', () => {
  it('separates design, rendering, recovery and invalid inputs', () => {
    const recovery: PosterItem = { ...base, id: 'recover', status: 'failed', generationRecoveryRequired: true, importError: '旧输入错误' };
    const invalid: PosterItem = { ...base, id: 'invalid', originalTitle: '', status: 'failed' };
    const complete: PosterItem = { ...ready, id: 'done', status: 'complete' };
    const items = [base, ready, recovery, invalid, complete];
    expect(posterQueue(items, 'design').map(item => item.id)).toEqual(['a']);
    expect(posterQueue(items, 'render').map(item => item.id)).toEqual(['ready', 'recover']);
    expect(posterQueue(items, 'render', true).map(item => item.id)).toEqual(['recover']);
    expect(posterWorkflowCounts(items)).toMatchObject({ total: 5, complete: 1, invalid: 1, ready: 1, recovery: 1 });
  });
  it('invalidates only the edited design and keeps the selected sample', () => {
    const edited = editedPosterInput({ ...ready, memoryUsageId: 'old' }, { ...ready, originalTitle: '新的相机文案', memorySampleId: 'sample-b' });
    expect(edited).toMatchObject({ coverTitle: '新的相机文案', memorySampleId: 'sample-b', status: 'idle', isTitleEdited: false });
    expect(edited.prompt).toBeUndefined();
    expect(edited.memoryUsageId).toBeUndefined();
    expect(ready.prompt).toBe('独立提示词');
    expect(editedPosterInput(ready, ready)).toBe(ready);
  });
  it('protects unresolved generation and completed results from input edits', () => {
    for (const item of [{ ...ready, generationRecoveryRequired: true }, { ...ready, status: 'complete' as const }]) {
      expect(() => editedPosterInput(item, { ...item, originalTitle: '新文案' })).toThrow('请先核对原任务');
    }
    expect(() => editedPosterInput(base, { ...base, originalTitle: '' })).toThrow('缺少原标题');
  });
});
