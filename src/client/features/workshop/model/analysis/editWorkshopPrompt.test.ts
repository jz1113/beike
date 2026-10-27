import { describe, expect, it } from 'vitest';
import { editWorkshopPrompt } from './editWorkshopPrompt';
import { checkWorkshopReadiness } from '../generation/workshopReadiness';
import type { BatchProductItem } from '../batchTypes';

function product(): BatchProductItem {
  return { id: 'product-1', itemId: '1234567', platform: 'jd', title: '耳机', category: '数码',
    price: 0, brand: '', coverImage: '/product.jpg', mainImages: ['/product.jpg'], skuImages: [], detailImages: [],
    props: {}, status: 'success', selected: true, allTypedImages: [{ url: '/product.jpg', type: 'main' }],
    selectedProductImages: ['/product.jpg'], analyzedSuccess: true,
    prompts: [1, 2, 3, 4].map(shot_no => ({ shot_no, prompt: `原始镜头${shot_no}` })), gridPrompt: '旧四宫格内容',
    masterGridUrl: '/old-grid.jpg', tasks: [1, 2, 3, 4].map(shot_no => ({ id: `t${shot_no}`, shot_no, title: '', prompt: '', status: 'SUCCESS' as const, resultUrl: `/result${shot_no}.jpg` })),
  };
}

describe('editing confirmed workshop prompts', () => {
  it('updates the grid projection while preserving unrelated single-shot results', () => {
    const initial = product();
    const next = editWorkshopPrompt(initial, 1, '新场景与新光线');
    expect(next.gridPrompt).toContain('新场景与新光线');
    expect(next.gridPrompt).not.toContain('原始镜头2');
    expect(next.gridPrompt).toContain('原始镜头1');
    expect(next.tasks[1].resultStatus).toBe('superseded');
    expect(next.tasks[0]).toBe(initial.tasks[0]);
    expect(next.tasks[1].resultUrl).toBe('/result2.jpg');
    expect(initial.prompts[1].prompt).toBe('原始镜头2');
    expect(next.masterGridUrl).toBeUndefined();
  });

  it('invalidates all slices when editing a shot from a shared grid', () => {
    const initial = product();
    initial.tasks = initial.tasks.map(task => ({ ...task, gridSourceUrl: '/old-grid.jpg' }));
    const next = editWorkshopPrompt(initial, 0, '新镜头');
    expect(next.tasks.every(task => task.resultStatus === 'superseded')).toBe(true);
  });

  it('blocks a cleared prompt until repaired without silently rerunning analysis', () => {
    const next = editWorkshopPrompt(product(), 0, ' ');
    expect(next.analyzedSuccess).toBe(true);
    expect(next.gridPrompt).toBeUndefined();
    const readiness = checkWorkshopReadiness([next], { generationStrategy: 'grid_first', selectedShotCount: 4 });
    expect(readiness.canGenerate).toBe(false);
    expect(readiness.issues.every(issue => issue.resolution === 'edit')).toBe(true);
  });

  it('does not modify a prompt while its original submission needs recovery', () => {
    const initial = product();
    initial.tasks[0].recoveryRequired = true;
    expect(editWorkshopPrompt(initial, 0, '新镜头')).toBe(initial);
  });
});
