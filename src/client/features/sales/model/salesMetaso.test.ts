import { afterEach, describe, expect, it } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { API_PROVIDERS_STORAGE_KEY, getModalityStorageKey } from '@shared/domain/models/modalityStorage';
import { normalizeScriptTemplate, type SalesReferenceSlot } from '@shared/domain/sales';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { emptySalesProductionPlan } from './salesProductionDraft';
import { resolveSalesVideoSettings } from './salesVideoSettings';
import { resolveSalesProductionTimeline } from './salesProductionTimeline';
import { compatibleSalesVideoModels } from './salesVideoCompatibility';

const source = normalizeScriptTemplate({ format: 'product', durationSec: 24, shots: [{ beats: [
  { start: 0, end: 12, action: '展示领口' }, { start: 12, end: 24, action: '转身展示背面' },
] }] })!;
const references: SalesReferenceSlot[] = [{ slotIndex: 1, mixedToken: '{{Mixed 1}}', apiToken: '图片1', kind: 'product', label: '商品', url: '/product.jpg' }];
const metaso = { id: 'metaso-h3', modelId: 'MiniMax-H3', entryId: 'metaso-h3', name: 'H3 秘塔', channelId: 'metaso' };
const official = { id: 'official-h3', modelId: 'MiniMax-H3', entryId: 'official-h3', name: 'H3 官方', channelId: 'official' };

function configureChannels() {
  const store = new Map([
    [getModalityStorageKey('video'), JSON.stringify([official, metaso])],
    [API_PROVIDERS_STORAGE_KEY, JSON.stringify([{ id: 'metaso', baseUrl: 'https://metaso.cn/api/minimax' }, { id: 'official', baseUrl: 'https://api.minimax.cn' }])],
  ]);
  configureDomainRuntime({ storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); }, removeItem: (key) => { store.delete(key); } } });
}

afterEach(() => configureDomainRuntime({ storage: null }));

describe('sales H3 settings follow the selected channel', () => {
  it('caps a 24-second script at fifteen seconds on Metaso 1080P and preserves its route address', () => {
    configureChannels();
    const plan = { ...emptySalesProductionPlan(), videoModel: metaso.id, videoResolution: '1080P' };
    expect(getGatewayClientBaseUrl(metaso.id)).toBe('https://metaso.cn/api/minimax');
    expect(resolveSalesVideoSettings(plan, source, references, ['/voice.wav'])).toMatchObject({
      model: 'MiniMax-H3', baseUrl: 'https://metaso.cn/api/minimax', resolution: '1080P',
    });
    expect(resolveSalesVideoSettings(plan, source, references).durationError).toContain('最长支持 15 秒');
    const timeline = resolveSalesProductionTimeline(plan, source, references);
    expect(timeline).toMatchObject({ targetDurationSec: 12, modelMaxDurationSec: 15, changed: true, error: '' });
    expect(source.durationSec).toBe(24);
  });

  it('keeps 2K and official H3 limited to fifteen seconds', () => {
    configureChannels();
    for (const plan of [
      { ...emptySalesProductionPlan(), videoModel: metaso.id, videoResolution: '2K' },
      { ...emptySalesProductionPlan(), videoModel: official.id, videoResolution: '1080P' },
    ]) {
      expect(resolveSalesVideoSettings(plan, source, references).durationError).toContain('最长支持 15 秒');
      expect(resolveSalesProductionTimeline(plan, source, references)).toMatchObject({ modelMaxDurationSec: 15, changed: true });
    }
  });

  it('recommends the compatible H3 channel even when its upstream model ID is duplicated', () => {
    configureChannels();
    const shortSource = normalizeScriptTemplate({ format: 'product', durationSec: 12, shots: [{ beats: [{ start: 0, end: 12, action: '展示领口' }] }] })!;
    const choices = compatibleSalesVideoModels(emptySalesProductionPlan(), shortSource, references, [official, metaso], ['/voice.wav']);
    expect(choices.map((item) => [item.id, item.durationSec])).toEqual([[official.id, 12], [metaso.id, 12]]);
    expect(compatibleSalesVideoModels(emptySalesProductionPlan(), source, references, [official, metaso])).toEqual([]);
  });
});
