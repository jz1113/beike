import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { useAppStore, type AppState, type GenerationTask } from '@client/store';
import { createHomeSlice } from '@client/store/homeSlice';
import { sanitizeTaskForStorage } from '@client/store/persist/generation';
import { GenerationTaskSchema } from '@shared/contracts/generate';
import { loadPromptPreferences } from '@client/shared/prompt-bar/promptBarPreferencesTypes';
import { agentModelName } from '../components/AgentTurn';
import { useGenerateTaskActions, restoreVideoTaskSettings } from '../hooks/useGenerateTaskActions';

vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useCallback: (callback: unknown) => callback, useRef: (value: unknown) => ({ current: value }),
}));

vi.mock('@client/shared/api/gatewayClient', () => ({ getGatewayClientBaseUrl: () => 'https://metaso.cn/api' }));

const model = 'gemini-custom-flash';
const createSettingsStore = () => createStore<AppState>()((...args) => createHomeSlice(...args) as AppState);

beforeEach(() => {
  const values = new Map<string, string>();
  const data = new Map([
    ['beike_api_providers_v2', JSON.stringify([{ id: 'relay', name: '阿卓反代' }])],
    ['beike_modality_models_v1_chat', JSON.stringify([
      { id: 'relay-entry', modelId: model, name: model, channelId: 'relay' },
      { id: 'global-entry', modelId: model, name: model },
    ])],
  ]);
  configureDomainRuntime({
    storage: {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => { data.set(key, value); },
      removeItem: key => { data.delete(key); },
    },
  });
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => {
  configureDomainRuntime({ storage: null });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('restored video Context IR preferences', () => {
  it('preserves false through task schema, JSON storage, history reuse and a fresh store', () => {
    const store = createSettingsStore();
    expect(store.getState().quickVideoContextIrEnabled).toBe(true);
    const saved = GenerationTaskSchema.parse({
      id: 'metaso-history', model: 'MiniMax-H3', title: '历史视频', prompt: '镜头推进', size: '16:9', quality: '1080P',
      videoDuration: 30, videoResolution: '1080P', videoContextIrEnabled: false,
      useReferenceImage: false, status: 'SUCCESS', progress: '100%', createdAt: 1,
    }) as GenerationTask;
    const restored = GenerationTaskSchema.parse(JSON.parse(JSON.stringify(sanitizeTaskForStorage(saved)))) as GenerationTask;
    restoreVideoTaskSettings(store.getState(), { ...restored, modelRouteKey: 'saved-metaso-route' });
    expect(store.getState()).toMatchObject({ quickVideoContextIrEnabled: false, quickVideoModel: 'saved-metaso-route', quickVideoDuration: 30 });
    expect(loadPromptPreferences().video.contextIrEnabled).toBe(false);
    expect(createSettingsStore().getState().quickVideoContextIrEnabled).toBe(false);
    store.getState().setQuickVideoContextIrEnabled(true);
    expect(createSettingsStore().getState().quickVideoContextIrEnabled).toBe(true);
  });

  it('restores old tasks without a Context IR field to the enabled default', () => {
    const store = createSettingsStore();
    store.getState().setQuickVideoContextIrEnabled(false);
    const old = GenerationTaskSchema.parse({ id: 'old', model: 'MiniMax-H3', title: '旧任务', prompt: '镜头推进', size: '16:9', quality: '1080P',
      useReferenceImage: false, status: 'SUCCESS', progress: '100%', createdAt: 1 }) as GenerationTask;
    restoreVideoTaskSettings(store.getState(), old);
    expect(store.getState().quickVideoContextIrEnabled).toBe(true);
  });
});

describe('agentModelName', () => {
  it('uses the selected channel when the server reports a shared upstream model', () => {
    const task = { model, agentTurn: { modelUsed: model } };
    expect(agentModelName({ ...task, modelRouteKey: 'global-entry' })).toBe(model);
    expect(agentModelName({ ...task, modelRouteKey: 'relay-entry' })).toBe(model + ' · 阿卓反代');
    expect(agentModelName(task)).toBe(model);
  });

  it('shows a different model reported by the server', () => {
    expect(agentModelName({ model, modelRouteKey: 'relay-entry', agentTurn: { modelUsed: 'fallback-model' } })).toBe('fallback-model');
  });
});

describe('audio history reuse', () => {
  it('restores the audio mode, route and settings after schema and local storage round trips', () => {
    const store = createSettingsStore();
    vi.spyOn(useAppStore, 'getState').mockReturnValue(store.getState());
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const task = GenerationTaskSchema.parse({
      id: 'audio-history', title: '历史语音', prompt: '欢迎回来', model: 'speech-2.8-hd', size: '-', quality: 'high',
      mediaType: 'audio', audioFormat: 'wav', audioVoice: 'saved-voice', audioSpeed: 0.8,
      useReferenceImage: false, status: 'SUCCESS', progress: '100%',
    }) as GenerationTask;
    const restored = GenerationTaskSchema.parse(JSON.parse(JSON.stringify(sanitizeTaskForStorage(task)))) as GenerationTask;
    useGenerateTaskActions(vi.fn()).handleReuseTask({ ...restored, modelRouteKey: 'saved-audio-route' });
    expect(store.getState()).toMatchObject({ quickGenMode: 'audio', quickAudioModel: 'saved-audio-route', quickPrompt: '欢迎回来' });
    expect(loadPromptPreferences().audio).toMatchObject({ format: 'wav', voice: 'saved-voice', speed: 0.8 });
  });
});
