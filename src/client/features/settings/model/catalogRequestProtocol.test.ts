import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogRequestProtocol } from './catalogRequestProtocol';
const fetch = vi.hoisted(() => vi.fn());
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: fetch }));
import { testModelConnection } from './settingsConnectionChecks';

beforeEach(() => {
  fetch.mockReset();
  fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
});
describe('explicit model catalog transport', () => {
  it('keeps native protocol intent on relay URLs and uses OpenAI for default/compatible catalogs', () => {
    expect(catalogRequestProtocol('gemini')).toEqual({ catalogProtocol: 'gemini', providerType: 'gemini' });
    expect(catalogRequestProtocol('anthropic')).toEqual({ catalogProtocol: 'anthropic', providerType: 'anthropic' });
    expect(catalogRequestProtocol()).toEqual({ catalogProtocol: 'openai', providerType: 'openai' });
    expect(catalogRequestProtocol('dashscope')).toEqual({ catalogProtocol: 'openai', providerType: 'dashscope' });
    expect(catalogRequestProtocol('custom', 'gemini')).toEqual({ catalogProtocol: 'gemini', providerType: 'custom' });
  });
  it.each(['gemini', 'anthropic', 'openai'])('sends %s directory probes with explicit catalog metadata', async providerType => {
    await testModelConnection('Relay', { providerType, baseUrl: 'https://relay.example/v1', apiKey: 'test-key' });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/system/models/fetch', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ providerType, catalogProtocol: providerType, baseUrl: 'https://relay.example/v1', apiKey: 'test-key', isPing: true, strict: true });
  });
  it('preserves an explicit native catalog protocol on a custom relay', async () => {
    await testModelConnection('Custom relay', { providerType: 'custom', catalogProtocol: 'gemini', baseUrl: 'https://relay.example', apiKey: 'test-key' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ providerType: 'custom', catalogProtocol: 'gemini', isPing: true, strict: true });
  });
  it('supports legacy provider fields without converting catalog checks to billable text generation', async () => {
    await testModelConnection('Claude relay', { provider: 'anthropic', apiKey: 'test-key' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ provider: 'anthropic', providerType: 'anthropic', catalogProtocol: 'anthropic' });
    expect(fetch.mock.calls[0][0]).toBe('/api/system/models/fetch');
  });
});
