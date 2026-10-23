import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { API_PROVIDERS_STORAGE_KEY, getModalityStorageKey } from '@shared/domain/models/modalityStorage';
import { coverVisionPickerModels, listCoverVisionModels, resolveCoverVisionRoute, type CoverVisionModel } from './coverVisionModels';

const memory = new Map<string, string>();

describe('cover vision models', () => {
  beforeEach(() => {
    memory.clear();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    };
    configureDomainRuntime({ storage });
    vi.stubGlobal('localStorage', storage);
  });

  it('does not invent models before the program has synced any', () => {
    expect(listCoverVisionModels()).toEqual([]);
  });

  it('adapts available entries without collapsing channel selection IDs', () => {
    const base: CoverVisionModel = {
      selectionId: 'vision-a', modelId: 'gpt-4o-mini', name: 'GPT 4o Mini', channel: '渠道甲', textProtocol: 'openai', unavailable: false,
    };
    expect(coverVisionPickerModels([
      base,
      { ...base, selectionId: 'vision-b', channel: '渠道乙' },
      { ...base, selectionId: 'missing-channel', channel: '渠道已移除', unavailable: true },
    ])).toEqual([
      { id: 'vision-a', upstreamId: 'gpt-4o-mini', name: 'GPT 4o Mini · 渠道甲', desc: '封面视觉反推', provider: '渠道甲' },
      { id: 'vision-b', upstreamId: 'gpt-4o-mini', name: 'GPT 4o Mini · 渠道乙', desc: '封面视觉反推', provider: '渠道乙' },
    ]);
    expect(coverVisionPickerModels([])).toEqual([]);
    expect(coverVisionPickerModels([{ ...base, channel: '' }])[0].name).toBe('GPT 4o Mini');
    expect(coverVisionPickerModels([{ ...base, unavailable: true }])).toEqual([]);
  });

  it('keeps channels separate and resolves the selected entry', () => {
    memory.set(API_PROVIDERS_STORAGE_KEY, JSON.stringify([
      { id: 'channel-a', name: '渠道甲', baseUrl: 'https://a.example', apiKey: 'key-a' },
      { id: 'channel-b', name: '渠道乙', baseUrl: 'https://b.example', apiKey: 'key-b' },
    ]));
    memory.set(getModalityStorageKey('chat'), JSON.stringify([
      { id: 'vision-a', name: 'Gemini', modality: 'chat', modelId: 'gemini-3-flash', channelId: 'channel-a' },
      { id: 'vision-b', name: 'Gemini', modality: 'chat', modelId: 'gemini-3-flash', channelId: 'channel-b', textProtocol: 'openai' },
      { id: 'text-only', name: 'DeepSeek', modality: 'chat', modelId: 'deepseek-chat', channelId: 'channel-a' },
      { id: 'openai-responses:gpt-5.6-luna', name: 'GPT', modality: 'chat', modelId: 'openai-responses:gpt-5.6-luna', channelId: 'channel-a' },
      { id: 'missing-channel', name: 'Claude', modality: 'chat', modelId: 'claude-3-7-sonnet', channelId: 'gone' },
    ]));
    const models = listCoverVisionModels();
    expect(models.find((model) => model.selectionId === 'text-only')).toBeUndefined();
    expect(models.find((model) => model.selectionId === 'openai-responses:gpt-5.6-luna')).toBeUndefined();
    expect(models.find((model) => model.selectionId === 'vision-a')).toMatchObject({ textProtocol: 'gemini' });
    expect(models.find((model) => model.selectionId === 'vision-b')).toMatchObject({ channel: '渠道乙', textProtocol: 'openai', unavailable: false });
    expect(models.find((model) => model.selectionId === 'missing-channel')).toMatchObject({ unavailable: true });
    expect(resolveCoverVisionRoute('vision-b')).toMatchObject({ modelId: 'gemini-3-flash', apiKey: 'key-b', baseUrl: 'https://b.example' });
    expect(() => resolveCoverVisionRoute('vision-removed')).toThrow('已失效');
  });
});
