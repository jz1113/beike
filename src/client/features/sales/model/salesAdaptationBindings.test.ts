import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate, type SalesSceneCandidate } from '@shared/domain/sales';
import { emptySalesCollection } from './salesCollectionDraft';
import { salesPlanAdaptationSourceKey, salesProductionSourceError } from './salesPlanSource';
import { salesAdaptationScriptKey } from './salesAdaptationBindings';

const scene: SalesSceneCandidate = { id: 'scene', title: '窗边', description: '靠近窗户的小桌', lighting: '侧光',
  category: '', spatialType: 'indoor', tags: '', suitableCategories: [], coverUrl: '/window.jpg', sourceImages: [], source: '' };

function adapted() {
  const state = emptySalesCollection();
  const script = normalizeScriptTemplate({ title: '商品展示', format: 'product', durationSec: 5,
    shots: [{ beats: [{ start: 0, end: 5, action: '手指沿衣角轻压', expression: '自然注视', transition: '松手回落' }] }] })!;
  state.selectedScriptId = 'script';
  state.productionPlan.sceneId = scene.id;
  state.productionPlan.adaptedBeats = [{ index: 0, subject: '', action: '保留手工调整', expression: '', transition: '', spokenLine: '', subtitle: '' }];
  state.productionPlan.adaptedSourceKey = salesPlanAdaptationSourceKey(state, script, scene);
  return { state, script };
}

describe('adapted scene and script provenance', () => {
  it('blocks a changed scene ID or upload and preserves edited beats', () => {
    const { state, script } = adapted();
    const beats = state.productionPlan.adaptedBeats;
    expect(salesProductionSourceError(state, false, script, scene)).toBe('');
    state.productionPlan.sceneId = 'different';
    expect(salesProductionSourceError(state, false, script, scene)).toContain('拍摄场景已变更');
    state.productionPlan.sceneId = scene.id;
    state.productionPlan.customSceneImageUrl = '/uploaded.jpg';
    expect(salesProductionSourceError(state, false, script, scene)).toContain('拍摄场景已变更');
    expect(state.productionPlan.adaptedBeats).toBe(beats);
  });

  it('tracks scene edits under the same ID and ignores inactive library settings for uploads', () => {
    const { state, script } = adapted();
    expect(salesProductionSourceError(state, false, script, { ...scene, description: '室外台阶' })).toContain('拍摄场景已变更');
    expect(salesProductionSourceError(state, false, script, { ...scene, coverUrl: '/replacement.jpg' })).toContain('拍摄场景已变更');
    state.productionPlan.customSceneImageUrl = '/custom.jpg';
    state.productionPlan.adaptedSourceKey = salesPlanAdaptationSourceKey(state, script, scene);
    state.productionPlan.sceneId = 'inactive';
    expect(salesProductionSourceError(state, false, script, { ...scene, description: '已变更' })).toBe('');
    state.productionPlan.customSceneImageUrl = '/new-custom.jpg';
    expect(salesProductionSourceError(state, false, script, scene)).toContain('拍摄场景已变更');
  });

  it.each(['action', 'actionTemplate', 'expression', 'transition', 'scene'] as const)('invalidates same-ID script %s edits', (field) => {
    const { state, script } = adapted();
    const beats = state.productionPlan.adaptedBeats;
    script.shots[0].beats[0][field] = '更新内容';
    expect(salesProductionSourceError(state, false, script, scene)).toContain('参考脚本内容已更新');
    expect(state.productionPlan.adaptedBeats).toBe(beats);
  });

  it('ignores review metadata, thumbnails and unrelated output settings', () => {
    const { state, script } = adapted();
    const key = salesAdaptationScriptKey(script);
    script.review.push('已复核');
    script.shots[0].beats[0].previewFrameUrl = '/updated-thumbnail.jpg';
    state.productionPlan.videoResolution = '720p';
    state.productionPlan.bgmId = 'other-bgm';
    expect(salesAdaptationScriptKey(script)).toBe(key);
    expect(salesProductionSourceError(state, false, script, scene)).toBe('');
  });

  it('requires legacy automatic provenance while keeping source-free manual edits usable', () => {
    const { state, script } = adapted();
    state.productionPlan.adaptedSourceKey = JSON.stringify(JSON.parse(state.productionPlan.adaptedSourceKey).slice(0, 5));
    expect(salesProductionSourceError(state, false, script, scene)).toContain('尚未记录场景或脚本内容来源');
    state.productionPlan.adaptedSourceKey = '';
    state.productionPlan.sceneId = 'new';
    script.shots[0].beats[0].expression = '修改表情';
    expect(salesProductionSourceError(state, false, script, scene)).toBe('');
  });

  it('checks product facts even when selling-point extraction was skipped', () => {
    const { state, script } = adapted();
    const beats = state.productionPlan.adaptedBeats;
    expect(state.productSummary).toBeUndefined();
    state.props = { 成分: '亚麻' };
    expect(salesProductionSourceError(state, false, script, scene)).toContain('商品资料已更新');
    expect(state.productionPlan.adaptedBeats).toBe(beats);
    state.productionPlan.adaptedSourceKey = '';
    expect(salesProductionSourceError(state, false, script, scene)).toBe('');
  });
});
