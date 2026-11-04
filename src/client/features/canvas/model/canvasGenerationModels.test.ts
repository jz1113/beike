import { describe, expect, it, vi } from 'vitest';
import { loadCanvasGenerationModels } from './canvasGenerationModels';

vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientBaseUrl: (selection: string) => selection === 'metaso-choice' ? 'https://metaso.cn/api' : 'https://api.minimax.cn',
}));
vi.mock('@shared/domain/models/modalityStorage', () => ({
  modalityPickerSelections: () => [
    { id: 'metaso-choice', modelId: 'MiniMax-H3', name: 'H3 · 秘塔' },
    { id: 'official-choice', modelId: 'MiniMax-H3', name: 'H3 · 官方' },
  ],
}));

describe('canvas video model routes', () => {
  it('keeps two channels of the same model selectable with their own capabilities', () => {
    const options = loadCanvasGenerationModels(true);
    expect(options.map((item) => item.id)).toEqual(['metaso-choice', 'official-choice']);
    expect(options[0].supportedResolutions).toEqual(['480P', '768P', '1080P', '2K']);
    expect(options[0].supportedDurations?.at(-1)).toBe(15);
    expect(options[1].supportedResolutions).toEqual(['720P', '1080P']);
    expect(options[1].supportedDurations?.at(-1)).toBe(15);
  });
});
