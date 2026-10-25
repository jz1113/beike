import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readStoredModalityModels,
  readEffectiveModalityModels,
  modalityPickerSelections,
  upstreamModalityModelId,
  getModalityStorageKey,
  getDismissedDefaultsKey,
  MODALITY_STORAGE_KEY_PREFIX,
  API_PROVIDERS_STORAGE_KEY,
  noteRemovedDefaultModels,
} from './modalityStorage';
import { configureDomainRuntime } from '../core/runtime';

const memoryStore = new Map<string, string>();

describe('modalityStorage', () => {
  beforeEach(() => {
    memoryStore.clear();
    const mockStorage = {
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStore.set(key, value);
      },
      removeItem: (key: string) => {
        memoryStore.delete(key);
      },
    };
    configureDomainRuntime({ storage: mockStorage });
    vi.stubGlobal('localStorage', mockStorage);
  });

  it('generates consistent storage keys', () => {
    expect(getModalityStorageKey('image')).toBe(`${MODALITY_STORAGE_KEY_PREFIX}image`);
    expect(getModalityStorageKey('video')).toBe(`${MODALITY_STORAGE_KEY_PREFIX}video`);
    expect(getModalityStorageKey('chat')).toBe(`${MODALITY_STORAGE_KEY_PREFIX}chat`);
  });

  it('returns empty array when storage is empty or invalid', () => {
    expect(readStoredModalityModels('image')).toEqual([]);

    memoryStore.set(getModalityStorageKey('image'), 'invalid json');
    expect(readStoredModalityModels('image')).toEqual([]);

    memoryStore.set(getModalityStorageKey('image'), JSON.stringify({ not: 'an array' }));
    expect(readStoredModalityModels('image')).toEqual([]);
  });

  it('correctly reads stored modality models', () => {
    const mockModels = [
      {
        id: 'img_flux_1',
        name: 'Flux Pro',
        modality: 'image',
        vendor: 'flux',
        modelId: 'flux-pro-1.1',
        isCustom: true,
      },
      {
        id: 'img_dalle_1',
        name: 'DALL-E 3',
        modality: 'image',
        vendor: 'openai',
        modelId: 'dall-e-3',
        isDefault: true,
      },
    ];

    memoryStore.set(getModalityStorageKey('image'), JSON.stringify(mockModels));
    const loaded = readStoredModalityModels('image');
    expect(loaded).toHaveLength(2);
    expect(loaded[0].modelId).toBe('flux-pro-1.1');
    expect(loaded[1].modelId).toBe('dall-e-3');
    expect(loaded[1].isDefault).toBe(true);
  });

  it('filters out legacy placeholder items such as un-synced doubao or chat_bytedance', () => {
    const mixedModels = [
      {
        id: 'chat_bytedance',
        name: '豆包',
        modality: 'chat',
        vendor: 'bytedance',
        modelId: 'doubao-pro-vision-32k',
      },
      {
        id: 'chat_real_1',
        name: 'doubao-seed-2-0-pro',
        modality: 'chat',
        vendor: 'bytedance',
        modelId: 'doubao-seed-2-0-pro',
        isCustom: true,
      },
    ];

    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify(mixedModels));
    const loaded = readStoredModalityModels('chat');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].modelId).toBe('doubao-seed-2-0-pro');
    expect(loaded[0].isCustom).toBe(true);
  });

  it('keeps the front picker on custom models until a modality list is saved', () => {
    expect(readEffectiveModalityModels('chat').configured).toBe(false);
    expect(modalityPickerSelections('chat')).toBeNull();
    expect(upstreamModalityModelId('chat', 'gpt-5.6-sol')).toBe('gpt-5.6-sol');
  });

  it('shows only the synced modality models, including duplicate ids on different channels', () => {
    memoryStore.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      { id: 'comfly_gateway', name: 'Comfly', baseUrl: 'https://channel.example', apiKey: 'sk-channel' },
    ]));
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify([
      { id: 'chat_sync_a', name: 'Gateway Opus', modality: 'chat', vendor: 'anthropic', modelId: 'claude-opus-4-6', channelId: 'comfly_gateway' },
      { id: 'chat_sync_b', name: 'Backup Opus', modality: 'chat', vendor: 'anthropic', modelId: 'claude-opus-4-6', channelId: '' },
      { id: 'chat_bytedance', name: '豆包', modality: 'chat', vendor: 'bytedance', modelId: 'doubao-pro' },
    ]));

    const options = modalityPickerSelections('chat');
    expect(options?.slice(0, 2).map((item) => item.modelId)).toEqual(['claude-opus-4-6', 'claude-opus-4-6']);
    expect(options?.slice(0, 2).map((item) => item.id)).toEqual(['chat_sync_a', 'chat_sync_b']);
    expect(options?.slice(0, 2).map((item) => item.name)).toEqual(['Gateway Opus · Comfly', 'Backup Opus']);
    expect(options?.some((item) => item.id === 'chat_bytedance')).toBe(false);
    expect(options?.some((item) => item.entryId === 'chat_openai_gpt')).toBe(true);
    expect(upstreamModalityModelId('chat', 'chat_sync_a')).toBe('claude-opus-4-6');
    expect(upstreamModalityModelId('chat', 'claude-opus-4-6')).toBe('claude-opus-4-6');
  });

  it('restores shipped defaults when a saved modality list is empty', () => {
    noteRemovedDefaultModels('image', [{ id: 'img_openai' }], []);
    memoryStore.set(getModalityStorageKey('image'), '[]');
    const read = readEffectiveModalityModels('image');
    expect(read.configured).toBe(true);
    expect(read.models.some((item) => item.modelId === 'gpt-image-2')).toBe(true);
    expect(read.persist?.some((item) => item.modelId === 'gpt-image-2')).toBe(true);
    expect(modalityPickerSelections('image')?.some((item) => item.modelId === 'gpt-image-2')).toBe(true);
    expect(memoryStore.has(getDismissedDefaultsKey('image'))).toBe(false);
  });

  it('keeps dismissed official seeds out of a non-empty list and still merges the rest', () => {
    const stored = [
      { id: 'chat_google_gemini', name: 'Gemini', modality: 'chat', vendor: 'google', modelId: 'gemini-3-flash-preview-thinking-128' },
      { id: 'chat_deepseek', name: 'DeepSeek', modality: 'chat', vendor: 'deepseek', modelId: 'deepseek-chat' },
      { id: 'chat_sync_a', name: 'Gateway Opus', modality: 'chat', vendor: 'anthropic', modelId: 'claude-opus-4-6' },
    ];
    const kept = stored.filter((item) => item.id === 'chat_sync_a');
    noteRemovedDefaultModels('chat', stored, kept);
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify(kept));

    const read = readEffectiveModalityModels('chat');
    expect(read.models.some((item) => item.id === 'chat_google_gemini' || item.modelId === 'gemini-3-flash-preview-thinking-128')).toBe(false);
    expect(read.models.some((item) => item.id === 'chat_deepseek' || item.modelId === 'deepseek-chat')).toBe(false);
    expect(read.persist?.some((item) => item.id === 'chat_google_gemini' || item.id === 'chat_deepseek') ?? false).toBe(false);
    expect(read.models.some((item) => item.id === 'chat_openai_gpt')).toBe(true);
    expect(read.persist?.some((item) => item.id === 'chat_openai_gpt')).toBe(true);

    const options = modalityPickerSelections('chat');
    expect(options?.some((item) => item.entryId === 'chat_google_gemini' || item.modelId === 'gemini-3-flash-preview-thinking-128')).toBe(false);
    expect(options?.some((item) => item.entryId === 'chat_deepseek' || item.modelId === 'deepseek-chat')).toBe(false);
    expect(options?.some((item) => item.entryId === 'chat_openai_gpt')).toBe(true);
  });

  it('keeps a real model named 豆包 when its id is not a placeholder', () => {
    memoryStore.set(getModalityStorageKey('chat'), JSON.stringify([
      { id: 'chat_doubao_live', name: '豆包', modality: 'chat', vendor: 'bytedance', modelId: 'doubao-seed-2-0-pro' },
    ]));
    const loaded = readStoredModalityModels('chat');
    expect(loaded.map((item) => item.id)).toContain('chat_doubao_live');
  });

  it('moves saved lip-sync models from video into avatar once', () => {
    memoryStore.set(getModalityStorageKey('video'), JSON.stringify([
      { id: 'vid_seedance', name: 'Seedance', modality: 'video', vendor: 'bytedance', modelId: 'doubao-seedance-2.5', isDefault: true },
      { id: 'vid_sync', name: 'Sync', modality: 'video', vendor: 'fal', modelId: 'sync-lipsync-2', isCustom: true },
    ]));
    const avatar = readEffectiveModalityModels('avatar');
    expect(avatar.configured).toBe(true);
    expect(avatar.models.map((item) => item.modelId)).toEqual(['sync-lipsync-2']);
    expect(avatar.models[0]?.modality).toBe('avatar');
    expect(readStoredModalityModels('video').map((item) => item.modelId)).toEqual(['doubao-seedance-2.5']);
    memoryStore.set(getModalityStorageKey('video'), JSON.stringify([
      ...readStoredModalityModels('video'),
      { id: 'vid_hedra', name: 'Hedra', modality: 'video', vendor: 'hedra', modelId: 'hedra-character-3' },
    ]));
    expect(readEffectiveModalityModels('avatar').models.map((item) => item.modelId)).toEqual(['sync-lipsync-2']);
  });

  it('leaves avatar unconfigured when saved video models are not drivers', () => {
    memoryStore.set(getModalityStorageKey('video'), JSON.stringify([
      { id: 'vid_seedance', name: 'Seedance', modality: 'video', vendor: 'bytedance', modelId: 'doubao-seedance-2.5' },
    ]));
    const avatar = readEffectiveModalityModels('avatar');
    expect(avatar.configured).toBe(false);
    expect(memoryStore.has(getModalityStorageKey('avatar'))).toBe(false);
    expect(readStoredModalityModels('video')).toHaveLength(1);
  });

  it('falls back to defaults when a saved list only contains invalid placeholders', () => {
    noteRemovedDefaultModels('image', [{ id: 'img_openai' }], []);
    memoryStore.set(getModalityStorageKey('image'), JSON.stringify([
      { id: 'img_meta', name: 'Meta', modality: 'image', vendor: 'meta', modelId: 'meta-image' },
    ]));
    const read = readEffectiveModalityModels('image');
    expect(read.configured).toBe(true);
    expect(read.persist?.some((item) => item.modelId === 'gpt-image-2')).toBe(true);
    expect(read.models.some((item) => item.modelId === 'gpt-image-2')).toBe(true);
    expect(modalityPickerSelections('image')?.some((item) => item.id === 'gpt-image-2')).toBe(true);
    expect(memoryStore.has(getDismissedDefaultsKey('image'))).toBe(false);
  });
});
