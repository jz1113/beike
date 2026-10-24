import { describe, expect, it } from 'vitest';
import { workshopReferenceInput, workshopReferenceBudget } from './workshopReferenceInput';

describe('workshop reference image roles', () => {
  it('keeps extra product views ahead of the source sample', () => {
    const result = workshopReferenceInput([{ shot_no: 3, prompt: '木桌俯拍', sourceReferenceImageUrl: 'sample-3' }], 4);
    expect(result.compositionReferenceImages).toEqual(['sample-3']);
    expect(result.instruction).toContain('分镜3的构图参考为 @图片5');
    expect(result.instruction).toContain('将其中旧商品完整替换');
  });
  it('maps grid positions to the corresponding original images', () => {
    const result = workshopReferenceInput([1, 2, 3, 4].map(n => ({ shot_no: n, prompt: `shot${n}`, sourceReferenceImageUrl: `sample${n}` })), 2);
    expect(result.instruction).toContain('分镜1（左上格）的构图参考为 @图片3');
    expect(result.instruction).toContain('分镜4（右下格）的构图参考为 @图片6');
  });
  it('does not silently discard missing references or mislabel legacy prompts', () => {
    expect(() => workshopReferenceInput([{ shot_no: 1, prompt: 'a', assembly_source: 'group_skeleton' }], 1)).toThrow('旧分析');
    expect(() => workshopReferenceInput([{ shot_no: 1, prompt: 'a', sourceReferenceImageUrl: 'a' }, { shot_no: 2, prompt: 'b' }], 1)).toThrow('不完整');
    expect(workshopReferenceInput([{ shot_no: 1, prompt: '手动导入' }], 1).instruction).toBe('');
  });
});

describe('workshop model reference budgets', () => {
  const shot = { shot_no: 1, prompt: '桌面', sourceReferenceImageUrl: 'original' };
  it('reserves the sample and optional face, keeping actual slots within the model limit', () => {
    expect(workshopReferenceBudget('gemini-2.5-flash-image', [shot], false)).toBe(2);
    expect(workshopReferenceBudget('gemini-2.5-flash-image', [shot], true)).toBe(1);
    expect(workshopReferenceBudget('qwen-image-3.0', [shot], false)).toBe(2);
    expect(workshopReferenceBudget('qwen-image-2.1', [shot], true)).toBe(4);
    expect(() => workshopReferenceBudget('qwen-image-edit', [shot], false)).toThrow('最多支持 1 张');
  });
  it('requires all grid samples and asks for single shots when the capacity cannot fit them', () => {
    const shots = [1, 2, 3, 4].map(n => ({ ...shot, shot_no: n, sourceReferenceImageUrl: `original${n}` }));
    expect(() => workshopReferenceBudget('qwen-image-3.0', shots, false)).toThrow('改用单张逐镜');
    expect(workshopReferenceBudget('gpt-image-2', shots, true)).toBe(4);
  });
});
