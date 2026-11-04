import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate, type SalesReferenceSlot } from '@shared/domain/sales';
import { emptySalesProductionPlan } from './salesProductionDraft';
import { compatibleSalesVideoModels, salesVideoModelPatch } from './salesVideoCompatibility';
import { resolveSalesVideoSettings } from './salesVideoSettings';

const script = normalizeScriptTemplate({ format: 'product', durationSec: 16.4, shots: [{ beats: [{ start: 0, end: 16.4, action: '展示商品' }] }] })!;
const references: SalesReferenceSlot[] = [{ slotIndex: 1, mixedToken: '{{Mixed 1}}', apiToken: '图片1', kind: 'product', label: '商品', url: '/product.jpg' }];
const models = [
  { id: 'mini-route', modelId: 'doubao-seedance-2.0-mini', entryId: 'mini-route', name: 'Mini' },
  { id: 'long-route-a', modelId: 'doubao-seedance-2.5', entryId: 'long-route-a', name: 'Seedance 2.5 · 渠道 A' },
  { id: 'long-route-b', modelId: 'doubao-seedance-2.5', entryId: 'long-route-b', name: 'Seedance 2.5 · 渠道 B' },
  { id: 'wan-route', modelId: 'wan3.0-video', entryId: 'wan-route', name: '万相 3.0' },
];

describe('compatible sales video model choices', () => {
  it('keeps the voice reference when recommending a model and excludes routes without audio-reference support', () => {
    const short = { ...script, durationSec: 5 };
    const h3 = { id: 'h3-route', modelId: 'MiniMax-H3', entryId: 'h3-route', name: 'MiniMax-H3' };
    const choices = [...models, h3, { id: 'veo-route', modelId: 'veo3.1', entryId: 'veo-route', name: 'Veo' }];
    expect(compatibleSalesVideoModels(emptySalesProductionPlan(), short, references, choices, ['/voice.mp3']).map((item) => item.id))
      .toEqual([...models, h3].map((item) => item.id));
  });

  it('offers only configured models that fit the full script and retains distinct channel identities', () => {
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini', videoDurationSec: 15 };
    const choices = compatibleSalesVideoModels(plan, script, references, models);
    expect(choices.map((item) => [item.id, item.durationSec])).toEqual([
      ['long-route-a', 17], ['long-route-b', 17], ['wan-route', 17],
    ]);
    expect(salesVideoModelPatch(choices[0].id).videoModel).toBe('long-route-a');
    expect(compatibleSalesVideoModels(plan, script, references, [models[0]])).toEqual([]);
    expect(compatibleSalesVideoModels(plan, script, references, [])).toEqual([]);
  });

  it('validates every image and video instead of recommending a model based only on duration', () => {
    const manyReferences: SalesReferenceSlot[] = Array.from({ length: 11 }, (_, index) => ({ ...references[0], slotIndex: index + 1, url: `/product-${index}.jpg` }));
    manyReferences.push({ ...references[0], slotIndex: 12, mediaType: 'video', kind: 'action', url: '/depth.mp4' });
    expect(compatibleSalesVideoModels(emptySalesProductionPlan(), script, manyReferences, models).map((item) => item.id))
      .toEqual(['long-route-a', 'long-route-b']);
  });

  it('applies the picker defaults so stale duration, mode and resolution cannot keep the replacement disabled', () => {
    const plan = { ...emptySalesProductionPlan(), videoRefMode: 'first_frame', videoResolution: '4K', videoDurationSec: 8, customPrompt: '原提示词', videoAspectRatio: '16:9' };
    const patch = salesVideoModelPatch('doubao-seedance-2.5');
    expect(patch).toMatchObject({ videoModel: 'doubao-seedance-2.5', videoRefMode: '', videoResolution: '', videoDurationSec: 0, customPrompt: '' });
    expect(resolveSalesVideoSettings({ ...plan, ...patch }, script, references))
      .toMatchObject({ durationSec: 17, resolution: '720P', refMode: 'omni', aspectRatio: '16:9', validationError: '' });
    expect(script.durationSec).toBe(16.4);
    expect(references).toHaveLength(1);
  });

  it('keeps the effective duration when changing from a shortened script to a longer-capacity model', () => {
    const short = { ...script, durationSec: 12.6 };
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini' };
    const patch = salesVideoModelPatch('doubao-seedance-2.5', { plan, script: short, references });
    expect(patch).toMatchObject({ videoModel: 'doubao-seedance-2.5', videoDurationSec: 13 });
    expect(resolveSalesVideoSettings({ ...plan, ...patch }, short, references).durationSec).toBe(13);
  });

  it('preserves a chosen shorter duration even when the original script is longer', () => {
    const original = normalizeScriptTemplate({ durationSec: 18.8, shots: [{ beats: [
      { start: 0, end: 13.8, action: '展示当前商品' }, { start: 13.8, end: 18.8, action: '展示背面' },
    ] }] })!;
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini', videoDurationSec: 14 };
    const patch = salesVideoModelPatch('doubao-seedance-2.5', { plan, script: original, references });
    expect(patch.videoDurationSec).toBe(14);
  });

  it('keeps the current complete-action duration when switching with the original reference script', () => {
    const original = normalizeScriptTemplate({ durationSec: 18.8, shots: [{ beats: [
      { start: 0, end: 13.8, action: '展示当前商品' }, { start: 13.8, end: 18.8, action: '展示背面' },
    ] }] })!;
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini' };
    const patch = salesVideoModelPatch('doubao-seedance-2.5', { plan, script: original, references });
    expect(patch.videoDurationSec).toBe(14);
  });

  it('replans duration when the replacement cannot support the current duration', () => {
    const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.5', videoDurationSec: 19 };
    expect(salesVideoModelPatch('doubao-seedance-2.0-mini', { plan, script, references }).videoDurationSec).toBe(0);
  });
});
