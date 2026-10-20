import { describe, expect, it } from 'vitest';
import { explicitBatchGenerationRequest } from './generationAuthorization';

describe('explicit paid batch generation authorization', () => {
  it.each(['把上面全部生成', '这些图片直接生成', '这组视频开始生成', '生成第 2 张', '把上述画出来',
    '所有视频渲染', '出图', 'Generate all images', 'render the above videos'])('accepts explicit final-media instructions: %s', text => {
    expect(explicitBatchGenerationRequest(text)).toBe(true);
  });

  it.each(['', '继续', '保存清单', '解释这些图片', '调整第2张的光影', '先写方案', '生成',
    '只要提示词', '只写提示词，所有图片先不要生成', '只给 prompt', '生成提示词', '写图片提示词',
    '不要生成全部图片', '不用生成这些视频', '先别生成图片', '暂不渲染这些视频', '不能生成图片', '不需要出图',
  ])('rejects planning, ambiguous instructions and explicit refusal: %s', text => {
    expect(explicitBatchGenerationRequest(text)).toBe(false);
  });

  it.each(['不生成图片', '请勿生成所有图片', 'Do not generate images', "Don't render videos", 'Generate image prompts only',
    '生成所有图片的提示词'])('keeps refusals and prompt-only instructions outside paid authorization: %s', text => {
    expect(explicitBatchGenerationRequest(text)).toBe(false);
  });
});
