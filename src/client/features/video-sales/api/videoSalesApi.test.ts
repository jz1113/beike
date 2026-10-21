import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetch = vi.hoisted(() => vi.fn());
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: fetch }));
vi.mock('@client/shared/utils/modelUsage', () => ({ recordChatTokens: vi.fn() }));
import { analyzeProductMedia, finalizeSalesPrompts, generateSalesScripts, selectSalesImages, validateSalesAssets } from './videoSalesApi';

const route = { model: 'claude-5.5-haiku', textProtocol: 'openai' as const, customBaseUrl: 'https://selected-channel.test', customApiKey: 'selected-key' };
const images = [{ index: 0, url: 'https://example.test/a.png', role: 'main' as const }];
const workflow = { workflowVersion: 3 as const, eligibleImageIndexes: [0], aspectRatio: '9:16' };
const shot = { shotId: 1, type: 'demo' as const, duration: 15, description: '展示', camera: '中景', visualSource: 'product_image' as const, transition: 'direct_concat' as const, voiceover: '看这里', imageIndex: 0 };
beforeEach(() => {
  fetch.mockReset();
  fetch.mockResolvedValue({ ok: true, json: async () => ({
    success: true, analysis: {}, scripts: [], assignments: [],
    fullPrompt: '整段', prompts: [{ shotId: 1, prompt: '镜头' }],
    validations: [{ id: 'a', status: 'passed', reason: '外观一致' }],
  }) });
});

describe('video sales selected text route', () => {
  it('retains the model-specific override and credentials across every text/vision stage', async () => {
    await analyzeProductMedia({ ...route, ...workflow, imageCatalog: images, productName: '裙子' });
    await generateSalesScripts({ ...route, ...workflow, productName: '裙子', category: 'fashion', videoMode: 'scene_demo', targetDuration: 15, imageCatalog: images });
    await selectSalesImages({ ...route, ...workflow, shots: [shot], imageCatalog: images });
    await finalizeSalesPrompts({ ...route, ...workflow, operation: 'finalize', shots: [shot], imageCatalog: images, targetDuration: 15, actualReferences: [{ id: 'a', kind: 'product', label: '裙子', url: images[0].url }] });
    await validateSalesAssets({ ...route, ...workflow, shots: [shot], imageCatalog: images, actualReferences: [{ id: 'a', kind: 'product', label: '裙子', url: images[0].url }] });
    expect(fetch).toHaveBeenCalledTimes(5);
    for (const [, init] of fetch.mock.calls) {
      expect(JSON.parse(init.body)).toMatchObject(route);
      expect(init.headers).toMatchObject({ 'x-custom-base-url': route.customBaseUrl, 'x-custom-api-key': route.customApiKey });
    }
  });
});
