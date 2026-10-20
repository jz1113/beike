import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetch = vi.hoisted(() => vi.fn());
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: fetch }));
vi.mock('@client/shared/utils/modelUsage', () => ({ recordChatTokens: vi.fn() }));
import { analyzeProductMedia, finalizeSalesPrompts, generateSalesScripts, selectSalesImages, validateSalesAssets } from './videoSalesApi';

const route = { model: 'claude-5.5-haiku', textProtocol: 'openai' as const, customBaseUrl: 'https://selected-channel.test', customApiKey: 'selected-key' };
const images = [{ index: 0, url: 'https://example.test/a.png', role: 'main' as const }];
beforeEach(() => { fetch.mockReset(); fetch.mockResolvedValue({ ok: true, json: async () => ({ analysis: {}, scripts: [], assignments: [], prompts: [], validations: [{ id: 'a', status: 'passed', reason: 'ok' }] }) }); });

describe('video sales selected text route', () => {
  it('retains the model-specific override and credentials across every text/vision stage', async () => {
    await analyzeProductMedia({ ...route, imageCatalog: images });
    await generateSalesScripts({ ...route, productName: '裙子', category: 'fashion', videoMode: 'scene_demo', targetDuration: 15 });
    await selectSalesImages({ ...route, shots: [], imageCatalog: images });
    await finalizeSalesPrompts({ ...route, shots: [], imageCatalog: images });
    await validateSalesAssets({ ...route, shots: [], imageCatalog: images, actualReferences: [{ id: 'a', kind: 'product', label: 'a', url: images[0].url }] });
    expect(fetch).toHaveBeenCalledTimes(5);
    for (const [, init] of fetch.mock.calls) {
      expect(JSON.parse(init.body)).toMatchObject(route);
      expect(init.headers).toMatchObject({ 'x-custom-base-url': route.customBaseUrl, 'x-custom-api-key': route.customApiKey });
    }
  });
});
