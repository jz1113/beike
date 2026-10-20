import { beforeEach, describe, expect, it, vi } from 'vitest';
const fetch = vi.hoisted(() => vi.fn());
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: fetch }));
import { createGatewayCatalogActions } from './gatewayCatalogActions';

function actions() {
  return createGatewayCatalogActions({
    baseUrl: 'https://relay.test/v1', apiKey: 'relay-key', showToast: vi.fn(),
    allGatewayModels: [], lianchiModels: [], openAIModels: [],
    requestRef: { current: { version: 0, controller: null } }, cacheRef: { current: {} },
    setGatewaySource: vi.fn(), setIsGatewayModalOpen: vi.fn(), setAllGatewayModels: vi.fn(),
    setIsFetchingGateway: vi.fn(), setGatewayModelError: vi.fn(), setLianchiModels: vi.fn(),
    setIsFetchingLianchi: vi.fn(), setLianchiModelError: vi.fn(), setOpenAIModels: vi.fn(),
    setOpenAIModelError: vi.fn(), setOpenAIModelSuggestedBaseUrl: vi.fn(),
    setOpenAIModelSource: vi.fn(), setIsFetchingOpenAI: vi.fn(),
  });
}
beforeEach(() => {
  fetch.mockReset();
  fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, models: [] }) });
});
describe('gateway catalog request protocols', () => {
  it('sends explicit OpenAI catalog metadata for the global relay', async () => {
    await actions().handleOpenGatewayDiscovery();
    expect(fetch.mock.calls[0][0]).toBe('/api/system/models/fetch');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      providerType: 'openai', catalogProtocol: 'openai', baseUrl: 'https://relay.test/v1', apiKey: 'relay-key',
    });
  });
  it('keeps relay credentials and HTTP consent for OpenAI discovery', async () => {
    await actions().handleOpenOpenAIDiscovery('http://relay.test/v1', 'chosen-key', true);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      provider: 'openai', providerType: 'openai', catalogProtocol: 'openai',
      baseUrl: 'http://relay.test/v1', apiKey: 'chosen-key', allowInsecureHttp: true, strict: true,
    });
  });
  it('keeps Lianchi routing independent of its OpenAI-compatible directory protocol', async () => {
    await actions().handleOpenLianchiDiscovery('lianchi-key');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      provider: 'lianchi', providerType: 'openai', catalogProtocol: 'openai', apiKey: 'lianchi-key', strict: true,
    });
  });
});
