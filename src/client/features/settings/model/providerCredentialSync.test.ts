import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveModalityModelRoute } from '@shared/domain/models/modalityStorage';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { API_PROVIDERS_STORAGE_KEY } from './apiProviderTypes';
import { PROVIDER_CREDENTIALS_CHANGED_EVENT, propagateProviderCredentials } from './providerCredentialSync';

const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
};

function setWindow() {
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {
    localStorage: storage,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function setGlobalConfig(baseUrl: string, apiKey: string) {
  store.set('beike_modality_global_config_v1', JSON.stringify({
    baseUrl,
    apiKey,
    baseUrlHistory: [baseUrl],
    apiKeyHistory: apiKey ? [apiKey] : [],
  }));
}

function setModalityModels(models: unknown[]) {
  store.set('beike_modality_models_v1_image', JSON.stringify(models));
}

describe('propagateProviderCredentials', () => {
  beforeEach(() => {
    store.clear();
    setWindow();
    configureDomainRuntime({ storage });
  });

  it('updates the Comfly global config, custom snapshots, and inherited modality credentials', () => {
    setGlobalConfig('https://old.example/', 'old-key');
    store.set('custom_models', JSON.stringify([
      {
        id: 'custom-old', name: 'Custom old', shortName: 'Custom', providerId: 'comfly_gateway',
        customBaseUrl: 'https://old.example', customApiKey: 'old-key', isCustom: true,
        isMultimodal: true, isVision: true, isAssistant: true, isImage: false, isVideo: false,
      },
      {
        id: 'custom-owned', name: 'Custom owned', shortName: 'Owned', providerId: 'comfly_gateway',
        customBaseUrl: 'https://owned.example', customApiKey: 'owned-key', isCustom: true,
        isMultimodal: true, isVision: true, isAssistant: true, isImage: false, isVideo: false,
      },
    ]));
    setModalityModels([
      {
        id: 'image-old', name: 'Old', modality: 'image', modelId: 'old-model',
        apiKey: 'old-key', baseUrl: 'https://old.example', isCustom: true,
      },
      {
        id: 'image-owned', name: 'Owned', modality: 'image', modelId: 'owned-model',
        apiKey: 'owned-key', baseUrl: 'https://owned.example', isCustom: true,
      },
    ]);
    store.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([{
      id: 'comfly_gateway', baseUrl: 'https://new.example', apiKey: 'new-key', providerType: 'openai',
    }]));

    const result = propagateProviderCredentials('comfly_gateway', {
      baseUrl: 'https://old.example',
      apiKey: 'old-key',
    }, {
      baseUrl: 'https://new.example',
      apiKey: 'new-key',
    });

    expect(result.updated).toBe(3);
    expect(JSON.parse(store.get('beike_modality_global_config_v1') || '{}')).toMatchObject({
      baseUrl: 'https://new.example',
      apiKey: 'new-key',
    });
    expect(JSON.parse(store.get('custom_models') || '[]')[0]).toMatchObject({
      customBaseUrl: 'https://new.example',
      customApiKey: 'new-key',
    });
    expect(JSON.parse(store.get('custom_models') || '[]')[1]).toMatchObject({
      customBaseUrl: 'https://owned.example',
      customApiKey: 'owned-key',
    });
    expect(JSON.parse(store.get('beike_modality_models_v1_image') || '[]')[0]).not.toHaveProperty('apiKey');
    expect(JSON.parse(store.get('beike_modality_models_v1_image') || '[]')[0]).not.toHaveProperty('baseUrl');
    expect(resolveModalityModelRoute('image', 'image-old')).toMatchObject({
      baseUrl: 'https://new.example',
      apiKey: 'new-key',
    });
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: PROVIDER_CREDENTIALS_CHANGED_EVENT,
    }));
  });

  it('keeps global values and custom credentials that do not match the previous values', () => {
    setGlobalConfig('https://current.example', 'current-key');
    setModalityModels([{
      id: 'image-current', name: 'Current', modality: 'image', modelId: 'current-model',
      apiKey: 'custom-key', baseUrl: 'https://current.example', isCustom: true,
    }]);

    propagateProviderCredentials('comfly_gateway', {
      baseUrl: 'https://old.example',
      apiKey: 'old-key',
    }, {
      baseUrl: 'https://new.example',
      apiKey: 'new-key',
    });

    expect(JSON.parse(store.get('beike_modality_global_config_v1') || '{}')).toMatchObject({
      baseUrl: 'https://current.example',
      apiKey: 'current-key',
    });
    expect(JSON.parse(store.get('beike_modality_models_v1_image') || '[]')[0]).toMatchObject({
      apiKey: 'custom-key',
      baseUrl: 'https://current.example',
    });
  });

  it('only updates channel-matched modality models for non-Comfly providers', () => {
    setGlobalConfig('https://global.example', 'global-key');
    setModalityModels([
      {
        id: 'image-relay', name: 'Relay', modality: 'image', modelId: 'relay-model',
        channelId: 'relay', apiKey: 'old-key', baseUrl: 'https://old.example', isCustom: true,
      },
      {
        id: 'image-global', name: 'Global', modality: 'image', modelId: 'global-model',
        apiKey: 'old-key', baseUrl: 'https://old.example', isCustom: true,
      },
    ]);

    propagateProviderCredentials('relay', {
      baseUrl: 'https://old.example',
      apiKey: 'old-key',
    }, {
      baseUrl: 'https://new.example',
      apiKey: 'new-key',
    });

    const saved = JSON.parse(store.get('beike_modality_models_v1_image') || '[]');
    expect(saved[0]).not.toHaveProperty('apiKey');
    expect(saved[0]).not.toHaveProperty('baseUrl');
    expect(saved[1]).toMatchObject({ apiKey: 'old-key', baseUrl: 'https://old.example' });
    expect(JSON.parse(store.get('beike_modality_global_config_v1') || '{}')).toMatchObject({
      apiKey: 'global-key',
      baseUrl: 'https://global.example',
    });
  });

  it('treats the legacy comfly provider id as the Comfly gateway', () => {
    setGlobalConfig('https://old.example', 'old-key');
    setModalityModels([{
      id: 'image-legacy-comfly', name: 'Legacy', modality: 'image', modelId: 'legacy-model',
      channelId: 'comfly', apiKey: 'old-key', baseUrl: 'https://old.example', isCustom: true,
    }]);

    propagateProviderCredentials('comfly', {
      baseUrl: 'https://old.example',
      apiKey: 'old-key',
    }, {
      baseUrl: 'https://new.example',
      apiKey: 'new-key',
    });

    expect(JSON.parse(store.get('beike_modality_global_config_v1') || '{}')).toMatchObject({
      baseUrl: 'https://new.example',
      apiKey: 'new-key',
    });
    expect(JSON.parse(store.get('beike_modality_models_v1_image') || '[]')[0]).not.toHaveProperty('apiKey');
    expect(JSON.parse(store.get('beike_modality_models_v1_image') || '[]')[0]).not.toHaveProperty('baseUrl');
  });

  it('does not overwrite a deliberate global value when the provider credentials did not change', () => {
    setGlobalConfig('https://manual.example', 'manual-key');

    const result = propagateProviderCredentials('comfly_gateway', {
      baseUrl: 'https://provider.example',
      apiKey: 'provider-key',
    }, {
      baseUrl: 'https://provider.example',
      apiKey: 'provider-key',
    });

    expect(result.updated).toBe(0);
    expect(JSON.parse(store.get('beike_modality_global_config_v1') || '{}')).toMatchObject({
      baseUrl: 'https://manual.example',
      apiKey: 'manual-key',
    });
  });
});
