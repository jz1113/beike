import { describe, expect, it } from 'vitest';
import type { ShotPrompt } from '@shared/domain/prompts/vision';
import { workshopReferenceInput, workshopReferenceBudget } from './workshopReferenceInput';

const skillShot: ShotPrompt = { shot_no: 1, prompt: '桌面自然光展示商品', assembly_source: 'skill' };

describe('workshop skill production images', () => {
  it('uses product views without composition references for both single shots and grids', () => {
    for (const shots of [[skillShot], [1, 2, 3, 4].map(n => ({ ...skillShot, shot_no: n }))]) {
      const result = workshopReferenceInput(shots, 3);
      expect(result.compositionReferenceImages).toEqual([]);
      expect(result.instruction).toContain('@图片1 至 @图片3');
      expect(result.instruction).toContain('按已确认的技能分镜执行');
      expect(result.instruction).not.toContain('@图片4');
    }
  });

  it.each<Partial<ShotPrompt>>([
    { assembly_source: 'group_skeleton' },
    { sourceReferenceImageUrl: 'old-sample' },
    { sourceGroupId: 'old-group' },
    { sourcePrompt: 'old reverse prompt' },
  ])('requires fresh analysis when legacy reference evidence remains: %j', legacy => {
    const shots = [{ ...skillShot, ...legacy }];
    expect(() => workshopReferenceInput(shots, 1)).toThrow('按创作技能重新分析');
    expect(() => workshopReferenceBudget('gpt-image-2', shots, false)).toThrow('按创作技能重新分析');
  });

  it('keeps manually imported text product-only', () => {
    const result = workshopReferenceInput([{ shot_no: 1, prompt: '手动导入' }], 1);
    expect(result.compositionReferenceImages).toEqual([]);
    expect(result.instruction).toContain('当前同款商品');
  });

  it('uses the model image capacity for product views without reserving sample slots', () => {
    expect(workshopReferenceBudget('gemini-2.5-flash-image', [skillShot], false)).toBe(3);
    expect(workshopReferenceBudget('qwen-image-3.0', [skillShot], false)).toBe(3);
    expect(workshopReferenceBudget('qwen-image-edit', [skillShot], false)).toBe(1);
    const grid = [1, 2, 3, 4].map(n => ({ ...skillShot, shot_no: n }));
    expect(workshopReferenceBudget('qwen-image-3.0', grid, false)).toBe(3);
    expect(workshopReferenceBudget('gpt-image-2', grid, false)).toBe(4);
  });
});
