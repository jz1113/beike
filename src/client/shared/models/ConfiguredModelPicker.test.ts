import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { PromptBarModelPickerModal } from '@client/shared/prompt-bar/controls/PromptBarModelPickerModal';
import { ConfiguredModelPicker, toPreferenceModelItems } from './ConfiguredModelPicker';
import { loadSystemConfiguredModels } from './configuredModels';

const data = new Map<string, string>();
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); },
  removeItem: (key: string) => { data.delete(key); },
};

beforeEach(() => {
  data.clear();
  configureDomainRuntime({ storage });
  vi.stubGlobal('window', { localStorage: storage });
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  configureDomainRuntime({ storage: null });
  vi.unstubAllGlobals();
});

describe('ConfiguredModelPicker', () => {
  it('extracts channels and upstream model IDs for the grouped model picker', () => {
    const items = toPreferenceModelItems([
      { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash · Comfly 网关' },
      { id: 'deepseek:deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash · DeepSeek 官方' },
    ], '反推视觉模型');

    expect(items).toEqual([
      {
        id: 'gemini-3.7-flash',
        name: 'Gemini 3.7 Flash',
        desc: '反推视觉模型',
        provider: 'Comfly 网关',
        upstreamId: 'gemini-3.7-flash',
      },
      {
        id: 'deepseek:deepseek-v4.1-flash',
        name: 'DeepSeek V4.1 Flash',
        desc: '反推视觉模型',
        provider: 'DeepSeek 官方',
        upstreamId: 'deepseek-v4.1-flash',
      },
    ]);

    const triggerHtml = renderToStaticMarkup(createElement(ConfiguredModelPicker, {
      ariaLabel: '反推视觉模型',
      options: [
        { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash · Comfly 网关' },
        { id: 'deepseek:deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash · DeepSeek 官方' },
      ],
      value: 'gemini-3.7-flash',
      onChange: vi.fn(),
    }));
    expect(triggerHtml).toContain('aria-label="反推视觉模型"');
    expect(triggerHtml).toContain('Gemini 3.7 Flash');
    expect(triggerHtml).toContain('Comfly 网关');

    const modalHtml = renderToStaticMarkup(createElement(PromptBarModelPickerModal, {
      isOpen: true,
      onClose: vi.fn(),
      triggerRef: { current: null },
      isUp: true,
      models: items,
      selectedModelId: 'gemini-3.7-flash',
      modalityKind: 'chat',
      onSelectModel: vi.fn(),
    }));
    expect(modalHtml).toContain('切换渠道');
    expect(modalHtml).toContain('Comfly 网关');
  });

  it('uses synced modality models in loadSystemConfiguredModels when available', () => {
    data.set('beike_modality_models_v1_chat', JSON.stringify([
      { id: 'chat_gpt61', name: 'GPT 6.1 Sol', modality: 'chat', vendor: 'openai', modelId: 'gpt-6.1-sol', isDefault: true },
      { id: 'chat_claude55', name: 'Claude 5.5 Opus', modality: 'chat', vendor: 'anthropic', modelId: 'claude-5.5-opus' },
    ]));
    const configured = loadSystemConfiguredModels();
    expect(configured.availableVisionModels.some((item) => item.upstreamId === 'gpt-6.1-sol')).toBe(true);
    expect(configured.availableVisionModels.some((item) => item.upstreamId === 'claude-5.5-opus')).toBe(true);
  });
});
