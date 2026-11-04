import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand';
import type { AppState, GenerationTask } from '@client/store';
import { createHomeSlice } from '@client/store/homeSlice';
import { sanitizeTaskForStorage } from '@client/store/persist/generation';
import { GenerationTaskSchema } from '@shared/contracts/generate';
import { loadPromptPreferences } from '@client/shared/prompt-bar/promptBarPreferencesTypes';
import { restoreVideoTaskSettings } from './videoTaskSettings';

vi.mock('@client/shared/api/gatewayClient', () => ({ getGatewayClientBaseUrl: () => 'https://metaso.cn/api' }));

const createSettingsStore = () => createStore<AppState>()((...args) => createHomeSlice(...args) as AppState);
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

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
