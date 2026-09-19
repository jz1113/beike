import { describe, expect, it } from 'vitest';
import { buildPerImageReversePrompt, buildUnifiedDeconstructPrompt } from './prompts';

describe('reverse request output contract', () => {
  it('retrying image 7 requests only that image', () => {
    const prompt = buildPerImageReversePrompt({ imageIndex: 7, totalImages: 10 });
    expect(prompt).toContain('image_index=7');
    expect(prompt).toContain('只输出第 7 张图片的分析');
    expect(prompt).not.toContain('必须输出恰好 7 条 per_image');
    expect(prompt).not.toContain('必须完整输出全部 7 张');
  });
  it('keeps complete batch indexing and permits absent human assets', () => {
    const prompt = buildUnifiedDeconstructPrompt({ imageCount: 3 });
    expect(prompt).toContain('必须输出恰好 3 条 per_image');
    expect(prompt).toContain('无人物时 has_human=false');
    expect(prompt).toContain('JSON 键名和枚举保留模板中的英文');
  });
});
