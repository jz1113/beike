import { expect, it } from 'vitest';
import { formatAnalyzedStoryboard } from './batchVisionAnalyzeFormat';
import type { BatchProductItem } from '../batchTypes';

it('preserves full adapted prompts and source evidence through single and grid formatting', () => {
  const prompts = [1, 2, 3, 4].map(n => ({ shot_no: n, prompt: `窗边木桌真实侧光${n}，不添加人像`, has_human: false,
    shot_type: 'pure_product', assembly_source: 'group_skeleton', sourcePrompt: `完整原始反推词${n}`,
    sourceReferenceImageUrl: `sample${n}`, sourceGroupId: 'group', sourceShotNo: n }));
  const formatted = formatAnalyzedStoryboard({ data: { prompts }, item: { coverImage: 'product', title: '手机' } as BatchProductItem, imagePayload: ['product'] });
  expect(formatted.formattedPrompts.map(shot => shot.prompt)).toEqual(prompts.map(shot => shot.prompt));
  expect(formatted.formattedPrompts[3].sourceReferenceImageUrl).toBe('sample4');
  expect(formatted.formattedPrompts[3].sourcePrompt).toBe('完整原始反推词4');
  expect(formatted.gridPrompt).toContain('窗边木桌真实侧光4');
  expect(formatted.gridPrompt).not.toContain('85mm');
});
