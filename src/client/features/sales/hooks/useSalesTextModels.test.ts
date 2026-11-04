import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modalityPickerSelections, readEffectiveModalityModels } from '@shared/domain/models/modalityStorage';
import { getEnabledMultimodalModelsFromSettings, getStoredMultimodalModelId, hasWorkflowModelConfiguration } from '@shared/domain/models/workflowModels';
import { useSalesTextModels } from './useSalesTextModels';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effect: undefined as (() => void | (() => void)) | undefined, mounted: false }));
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => { if (!hooks.mounted) { hooks.effect = effect; hooks.mounted = true; } },
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (next: T) => { hooks.slots[index] = next; }];
  },
}));
vi.mock('@shared/domain/models/modalityStorage', () => ({ modalityPickerSelections: vi.fn(), readEffectiveModalityModels: vi.fn() }));
vi.mock('@shared/domain/models/workflowModels', async (original) => ({
  ...await original<typeof import('@shared/domain/models/workflowModels')>(),
  getEnabledMultimodalModelsFromSettings: vi.fn(), getStoredMultimodalModelId: vi.fn(), hasWorkflowModelConfiguration: vi.fn(),
}));
const text = { id: 'text-route', entryId: 'text-entry', modelId: 'text-only-model', name: '纯文字模型', provider: '自选渠道' };
let cleanup: (() => void) | undefined;
function useHarness(preferred = '') {
  hooks.index = 0;
  const result = useSalesTextModels(preferred);
  if (hooks.effect) { cleanup = hooks.effect() || undefined; hooks.effect = undefined; }
  return result;
}
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.effect = undefined; hooks.mounted = false;
  cleanup = undefined;
  vi.resetAllMocks();
  vi.stubGlobal('window', new EventTarget());
  vi.mocked(modalityPickerSelections).mockReturnValue([text]);
  vi.mocked(readEffectiveModalityModels).mockReturnValue({ configured: true, models: [], persist: null });
  vi.mocked(getEnabledMultimodalModelsFromSettings).mockReturnValue([]);
  vi.mocked(getStoredMultimodalModelId).mockImplementation((fallback) => fallback || '');
  vi.mocked(hasWorkflowModelConfiguration).mockReturnValue(false);
});
afterEach(() => { cleanup?.(); vi.unstubAllGlobals(); });

describe('selling point and storyboard text model selection', () => {
  it('offers text-only chat models and keeps their channel identity', () => {
    useHarness();
    expect(useHarness()).toEqual({ model: text.entryId, options: [{ id: text.entryId, name: text.name, upstreamId: text.modelId, provider: text.provider }] });
    expect(getEnabledMultimodalModelsFromSettings).not.toHaveBeenCalled();
  });

  it('preserves an exact route when multiple channels use the same upstream model', () => {
    vi.mocked(modalityPickerSelections).mockReturnValue([text, { ...text, id: 'other-route', entryId: 'other-entry', provider: '另一渠道' }]);
    useHarness('other-entry');
    expect(useHarness('other-entry').model).toBe('other-entry');
    expect(useHarness().options.map((option) => option.id)).toEqual(['text-entry', 'other-entry']);
    expect(useHarness(text.modelId).model).toBe(text.entryId);
    expect(useHarness('removed-route').model).toBe(text.entryId);
  });

  it('restores a saved upstream selection to its configured entry and prefers exact channel selections', () => {
    vi.mocked(modalityPickerSelections).mockReturnValue([text, { ...text, id: 'other-route', entryId: 'other-entry', provider: '另一渠道' }]);
    vi.mocked(getStoredMultimodalModelId).mockReturnValue(text.modelId);
    useHarness();
    expect(useHarness().model).toBe('text-entry');
    expect(useHarness('other-entry').model).toBe('other-entry');
  });

  it('uses the configured default entry when no previous model was selected', () => {
    vi.mocked(modalityPickerSelections).mockReturnValue([text, { ...text, id: 'other-route', entryId: 'other-entry' }]);
    vi.mocked(readEffectiveModalityModels).mockReturnValue({ configured: true, models: [
      { id: 'other-entry', modelId: text.modelId, name: '默认渠道', modality: 'chat', isDefault: true },
    ], persist: null });
    useHarness();
    expect(useHarness().model).toBe('other-entry');
  });

  it('keeps an explicitly empty configured list empty instead of showing legacy models', () => {
    vi.mocked(modalityPickerSelections).mockReturnValue([]);
    vi.mocked(getEnabledMultimodalModelsFromSettings).mockReturnValue([{ id: 'legacy', name: '旧模型' }]);
    useHarness();
    expect(useHarness()).toEqual({ model: '', options: [] });
    expect(getEnabledMultimodalModelsFromSettings).not.toHaveBeenCalled();
  });

  it('uses the assistant pool for legacy settings without requiring vision support', () => {
    vi.mocked(modalityPickerSelections).mockReturnValue(null);
    vi.mocked(getEnabledMultimodalModelsFromSettings).mockReturnValue([{ id: 'deepseek-official:deepseek-flash', name: 'DeepSeek Flash', isAssistant: true, isVision: false }]);
    useHarness();
    expect(getEnabledMultimodalModelsFromSettings).toHaveBeenCalledWith(undefined, 'assistant');
    expect(useHarness().model).toBe('deepseek-official:deepseek-flash');
    expect(useHarness().options[0].upstreamId).toBe('deepseek-flash');
  });

  it('reloads changed model settings and removes subscriptions on unmount', () => {
    useHarness();
    vi.mocked(modalityPickerSelections).mockReturnValue([{ ...text, id: 'new-route', entryId: 'new-entry' }]);
    window.dispatchEvent(new Event('modality_models_updated'));
    expect(useHarness().model).toBe('new-entry');
    const count = vi.mocked(modalityPickerSelections).mock.calls.length;
    cleanup?.(); cleanup = undefined;
    window.dispatchEvent(new Event('models_updated'));
    expect(modalityPickerSelections).toHaveBeenCalledTimes(count);
  });
});
