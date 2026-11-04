import { describe, expect, it, vi } from 'vitest';
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
