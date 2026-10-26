import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetch = vi.hoisted(() => vi.fn());
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: fetch, readClientStorageConfig: () => ({}), storageConfigHeaders: () => ({}) }));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientHeaders: () => ({ 'x-custom-base-url': 'https://selected.example' }),
  getGatewayClientOverrides: () => ({ customBaseUrl: 'https://global.example', customApiKey: 'global-key' }),
  getModelCredentials: () => ({ baseUrl: 'https://selected.example', apiKey: 'selected-key' }),
}));
import { lookupSalesImageSubmission, submitSalesImageBatch } from './salesImageBatch';

const items = [
  { id: 'person', prompt: '人物', imageModel: 'image-selected', idempotencyKey: 'person-key' },
  { id: 'scene', prompt: '房间', imageModel: 'image-selected', idempotencyKey: 'scene-key' },
];
beforeEach(() => fetch.mockReset());

describe('sales image batch transport', () => {
  it('uses the model channel credentials and binds reordered replies by asset ID', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, items: [
      { id: 'scene', success: true, status: 'SUCCESS', resultUrl: '/scene.jpg' },
      { id: 'person', success: true, status: 'SUCCESS', resultUrl: '/person.jpg' },
    ] }) });
    expect(await submitSalesImageBatch(items, () => false)).toEqual([
      expect.objectContaining({ id: 'person', outcome: 'done', url: '/person.jpg' }),
      expect.objectContaining({ id: 'scene', outcome: 'done', url: '/scene.jpg' }),
    ]);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.items.every((item: Record<string, unknown>) => item.customBaseUrl === 'https://selected.example' && item.customApiKey === 'selected-key')).toBe(true);
  });
  it('keeps missing or duplicate item replies unresolved instead of assigning another image', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, items: [
      { id: 'person', success: true, status: 'SUCCESS', resultUrl: '/one.jpg' },
      { id: 'person', success: true, status: 'SUCCESS', resultUrl: '/two.jpg' },
    ] }) });
    const receipts = await submitSalesImageBatch(items, () => false);
    expect(receipts).toEqual([
      expect.objectContaining({ id: 'person', outcome: 'uncertain' }),
      expect.objectContaining({ id: 'scene', outcome: 'uncertain' }),
    ]);
    expect(receipts.every((receipt) => !receipt.url)).toBe(true);
  });
  it('passes the original model for keyed image recovery', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'SUCCESS', resultUrl: '/original.jpg' }) });
    expect(await lookupSalesImageSubmission('saved-key', 'openai/gpt-image-2', () => false)).toMatchObject({ outcome: 'done', url: '/original.jpg' });
    expect(fetch.mock.calls[0][0]).toBe('/api/generate/image?taskKey=saved-key&model=openai%2Fgpt-image-2');
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
