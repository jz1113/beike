import { describe, expect, it } from 'vitest';
import type { BatchProductItem } from '../batchTypes';
import { workshopAnalysisBlockReason, type AnalysisPreflightConfig } from './workshopAnalysisPreflight';

const product = {
  id: 'product', title: '智能手机', status: 'success', props: {}, selectedProductImages: ['product.jpg'],
} as BatchProductItem;
const config: AnalysisPreflightConfig = { selectedArchId: 'auto', recipes: [{ id: '__category_skill__', name: '创作技能' }] };

describe('workshop skill analysis readiness', () => {
  it('accepts product images and a skill regardless of historical asset locks or inventory failures', () => {
    const restored = Object.assign({}, config, { lockedFullPromptId: 'deleted', lockedPersonaId: 'missing', personaMode: 'none', availableFullPrompts: [], assetLoadState: 'error' });
    expect(workshopAnalysisBlockReason(restored, product)).toBeNull();
  });

  it('requires collected product facts and an actual selected image', () => {
    expect(workshopAnalysisBlockReason(config, { ...product, status: 'failed' })).toContain('商品采集');
    expect(workshopAnalysisBlockReason(config, { ...product, selectedProductImages: [' '] })).toContain('确认商品图');
  });

  it('reports skill loading failures and deleted or empty manual skills before model calls', () => {
    expect(workshopAnalysisBlockReason({ ...config, skillLoadState: 'loading' }, product)).toContain('正在加载创作技能');
    expect(workshopAnalysisBlockReason({ ...config, skillLoadState: 'error', skillLoadError: '网络异常' }, product)).toContain('网络异常');
    expect(workshopAnalysisBlockReason({ ...config, selectedArchId: 'deleted' }, product)).toContain('创作技能已失效');
    expect(workshopAnalysisBlockReason({ selectedArchId: 'manual', recipes: [{ id: 'manual', name: '手动技能', promptSnippet: ' ' }] }, product)).toContain('技能内容为空');
  });
});
