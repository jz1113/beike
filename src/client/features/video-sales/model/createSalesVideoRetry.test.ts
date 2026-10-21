import { describe, expect, it } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/video-sales';
import { createSalesVideoRetry } from './createSalesVideoRetry';
const original: VideoSalesScript = { id: 'original', title: '', totalDuration: 15, shots: [], seo: { title: '', hashtags: [], coverText: '', description: '', interactionGuide: '' }, renderStatus: 'uncertain', renderSubmissionKey: 'original-key', fullPrompt: '保留的完整提示词', finalizedRevision: 'approved', renderError: '未知结果' };
describe('a manually verified new attempt', () => {
  it('preserves approved creative content and leaves the original receipt intact', () => {
    const retry = createSalesVideoRetry(original, 'new-draft');
    expect(retry).toMatchObject({ id: 'new-draft', renderStatus: 'pending', fullPrompt: original.fullPrompt, finalizedRevision: 'approved' });
    expect(retry.renderSubmissionKey).toBeUndefined();
    expect(original.renderSubmissionKey).toBe('original-key');
    expect(original.renderStatus).toBe('uncertain');
  });
  it('prevents abandoning a task with a queryable upstream receipt', () => {
    expect(() => createSalesVideoRetry({ ...original, renderTaskId: 'paid-task' }, 'new')).toThrow('继续查询');
  });
});
