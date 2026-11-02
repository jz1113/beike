import { describe, expect, it } from 'vitest';
import { shouldAnalyzeVideoDirectly } from './mediaAnalysis';

const video = { role: 'user', content: '分析视频并生成分镜提示词', attachments: [{ type: 'video', url: '/storage/local/video.mp4' }] };

describe('direct multimodal video analysis', () => {
  it('analyzes an uploaded video and prompt-writing requests without skills', () => {
    expect(shouldAnalyzeVideoDirectly([video])).toBe(true);
  });
  it('keeps follow-up questions in the same direct analysis flow', () => {
    expect(shouldAnalyzeVideoDirectly([video, { role: 'assistant', content: '分析结果' }, { role: 'user', content: '继续细化最后一个镜头' }])).toBe(true);
  });
  it('preserves explicitly selected skills and requests to generate actual media', () => {
    expect(shouldAnalyzeVideoDirectly([video], 'video-teardown')).toBe(false);
    expect(shouldAnalyzeVideoDirectly([video, { role: 'user', content: '把上面的这些视频全部生成' }])).toBe(false);
  });
  it('keeps normal text and image-only conversations on the agent route', () => {
    expect(shouldAnalyzeVideoDirectly([{ role: 'user', content: '你好', attachments: [null, { type: 'image' }] }])).toBe(false);
  });
});
