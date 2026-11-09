import { describe, expect, it, vi } from 'vitest';
import { groupModelsByGeneration } from '@shared/domain/models/modelGrouping';
import { listModelChannels, modelsInChannel, samePickerModel, pickerSelectionId } from './controls/PromptBarModelPickerModal';
import { buildPromptBarGenerationTasks, canSubmitPromptBar, type PromptBarSubmitInput } from './promptBarSubmit';

vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientBaseUrl: (selection: string) => selection === 'metaso-h3' ? 'https://metaso.cn/api' : 'https://api.minimax.cn',
}));
vi.mock('@shared/domain/models/modalityStorage', async (original) => ({
  ...await original<typeof import('@shared/domain/models/modalityStorage')>(),
  upstreamModalityModelId: (_kind: string, selection: string) => /^(metaso|official)-h3$/.test(selection) ? 'MiniMax-H3' : selection,
}));

function input(selection = 'metaso-h3', resolution = '1080P', duration = 15): PromptBarSubmitInput {
  return {
    quickGenMode: 'video', quickPrompt: '镜头缓慢推进', quickRefImages: [], activeSubjects: [], allSubjects: [],
    quickVideoRefMode: 'text', quickVideoFirstFrame: null, quickVideoLastFrame: null, quickVideoMultiFrames: [],
    quickCount: 1, quickVideoCount: 1, quickModel: '', quickVideoModel: selection, sizeStr: '16:9', quickQuality: 'medium',
    quickVideoAspectId: '16:9', quickVideoResolution: resolution, quickVideoDuration: duration,
    currentView: 'generate', hasImageModels: false, hasVideoModels: true, quickDepthStyle: 'mocap', quickDepthQuality: 'standard',
  };
}

describe('prompt bar selected H3 channel', () => {
  it.each(['480P', '768P', '1080P', '2K'])('queues fifteen-second Metaso %s and refuses longer tasks', (resolution) => {
    expect(canSubmitPromptBar(input('metaso-h3', resolution))).toBe(true);
    const result = buildPromptBarGenerationTasks(input('metaso-h3', resolution));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tasks[0]).toMatchObject({ model: 'MiniMax-H3', modelRouteKey: 'metaso-h3', videoDuration: 15, videoResolution: resolution });
    for (const duration of [16, 30]) expect(canSubmitPromptBar(input('metaso-h3', resolution, duration))).toBe(false);
  });

  it('enforces the shorter 2K limit and preserves official channel limits', () => {
    expect(canSubmitPromptBar(input('metaso-h3', '2K', 30))).toBe(false);
    expect(canSubmitPromptBar(input('metaso-h3', '2K', 15))).toBe(true);
    expect(canSubmitPromptBar(input('official-h3', '1080P', 30))).toBe(false);
    expect(canSubmitPromptBar(input('official-h3', '480P', 15))).toBe(false);
    expect(canSubmitPromptBar(input('official-h3', '1080P', 15))).toBe(true);
  });

  it('retains the explicit Context IR choice in queued video tasks', () => {
    for (const enabled of [undefined, false, true]) {
      const result = buildPromptBarGenerationTasks({ ...input(), quickVideoContextIrEnabled: enabled });
      expect(result.ok && result.tasks[0].videoContextIrEnabled).toBe(enabled ?? true);
    }
  });
});

const models = [
  { id: 'a-gemini', upstreamId: 'gemini-3-flash', provider: '网关甲', name: 'Gemini · 网关甲' },
  { id: 'b-gemini', upstreamId: 'gemini-3-flash', provider: '网关乙', name: 'Gemini · 网关乙' },
  { id: 'b-claude', upstreamId: 'claude-sonnet-4-5', provider: '网关乙', name: 'Claude' },
  { id: 'plain', upstreamId: 'gpt-5.6-sol', name: 'GPT' },
];

describe('model picker channels', () => {
  it('splits one upstream model across gateways and keeps generation groups inside a channel', () => {
    expect(listModelChannels(models)).toEqual(['网关甲', '网关乙', '默认']);
    const gateway = modelsInChannel(models, '网关乙');
    expect(gateway.map((model) => model.id)).toEqual(['b-gemini', 'b-claude']);
    const sections = groupModelsByGeneration(gateway.map((model) => model.upstreamId), 'chat');
    const labels = sections.flatMap((section) => section.rows.filter((row) => !row.isArchived).map((row) => row.generationLabel));
    expect(labels.some((label) => label.includes('Gemini'))).toBe(true);
    expect(labels.some((label) => label.includes('Claude'))).toBe(true);
    expect(labels.join(' ')).not.toContain('gemini-3-flash');
  });
});


describe('model picker identity', () => {
  it('keeps separately synced aliases and preview IDs individually selectable', () => {
    const synced = [
      { id: 'preview-route', upstreamId: 'gemini-3.1-flash-image-preview' },
      { id: 'standard-route', upstreamId: 'gemini-3.1-flash-image' },
      { id: 'banana-route', upstreamId: 'nano-banana-2' },
    ];
    expect(samePickerModel('gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image')).toBe(false);
    expect(samePickerModel('nano-banana-2', 'gemini-3.1-flash-image')).toBe(false);
    expect(pickerSelectionId(synced, 'gemini-3.1-flash-image', 'preview-route')).toBe('standard-route');
    expect(pickerSelectionId(synced, 'nano-banana-2', 'preview-route')).toBe('banana-route');
  });
});
