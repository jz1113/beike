import { describe, expect, it } from 'vitest';
import { workshopReferenceInput } from './workshopReferenceInput';

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
