import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), providers: [] as Array<{ id: string; name: string; providerType: string; baseUrl: string; apiKey: string; enabled: boolean }> }));
vi.mock('react', () => ({
  useState: <T,>(initial: T | (() => T)) => [typeof initial === 'function' ? (initial as () => T)() : initial, vi.fn()],
  useMemo: <T,>(factory: () => T) => factory(), useCallback: <T,>(callback: T) => callback, useEffect: vi.fn(),
}));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: mocks.fetch }));
vi.mock('../model/apiProviderTypes', () => ({ loadStoredProviders: () => mocks.providers }));
import { useModalityChannelCatalog } from './useModalityChannelCatalog';
const config = { baseUrl: 'https://global.test', apiKey: 'global-key', baseUrlHistory: [], apiKeyHistory: [] };
beforeEach(() => {
  mocks.providers = [];
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, models: [] }) });
});
describe('modality channel catalog requests', () => {
  it.each(['gemini', 'anthropic', 'openai'])('keeps the %s protocol explicit for a relay channel', async providerType => {
    mocks.providers = [{ id: 'relay', name: 'Relay', providerType, baseUrl: 'https://relay.test', apiKey: 'channel-key', enabled: true }];
    await useModalityChannelCatalog(config, vi.fn()).syncChannel('relay');
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ providerType, catalogProtocol: providerType, baseUrl: 'https://relay.test', apiKey: 'channel-key' });
  });
  it('marks the global relay catalog as OpenAI rather than inferring from a display name', async () => {
    await useModalityChannelCatalog(config, vi.fn()).syncChannel('');
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ providerType: 'openai', catalogProtocol: 'openai', baseUrl: config.baseUrl });
  });
});
