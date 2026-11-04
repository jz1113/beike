import { describe, expect, it } from 'vitest';
import type { GenerationTask } from '@client/store';
import { prepareVideoSubmissionInput } from './videoSubmissionInput';

const task: GenerationTask = {
  id: 'h3-input', title: 'H3 task', useReferenceImage: false, model: 'MiniMax-H3', modelRouteKey: 'chosen-metaso-channel', prompt: '镜头推进',
  mediaType: 'video', size: '16:9', quality: '1080P', videoResolution: '1080P', videoRefMode: 'text', videoDuration: 30,
  status: 'IN_PROGRESS', progress: '0%', createdAt: 1,
};

describe('final video submission input', () => {
  it.each(['480P', '768P', '1080P', '2K'])('allows fifteen-second %s and rejects longer Metaso output before dispatch', (resolution) => {
    expect(prepareVideoSubmissionInput({ ...task, videoResolution: resolution, videoDuration: 15 }, 'https://metaso.cn/api', [], [])).toEqual({ resolution, context_ir_enabled: true });
    for (const duration of [16, 30]) expect(() => prepareVideoSubmissionInput({ ...task, videoResolution: resolution, videoDuration: duration }, 'https://metaso.cn/api', [], [])).toThrow('时长');
  });

  it('rejects unsupported output durations before dispatch and retains distinct 2K', () => {
    expect(() => prepareVideoSubmissionInput({ ...task, videoResolution: '2K' }, 'https://metaso.cn', [], [])).toThrow('时长');
    expect(prepareVideoSubmissionInput({ ...task, videoResolution: '2K', videoDuration: 15 }, 'https://metaso.cn', [], [])).toEqual({ resolution: '2K', context_ir_enabled: true });
    expect(() => prepareVideoSubmissionInput(task, 'https://api.minimax.cn', [], [])).toThrow('时长');
    expect(() => prepareVideoSubmissionInput(task, 'https://ai.comfly.org', [], [])).toThrow('时长');
  });

  it('sends explicit Context IR false to Metaso and omits it for other channels', () => {
    expect(prepareVideoSubmissionInput({ ...task, videoDuration: 15, videoContextIrEnabled: false }, 'https://metaso.cn/api', [], []))
      .toEqual({ resolution: '1080P', context_ir_enabled: false });
    for (const base of ['https://api.minimax.cn', 'https://ai.comfly.org', 'https://metaso.cn.example.org']) {
      expect(prepareVideoSubmissionInput({ ...task, videoDuration: 15, videoContextIrEnabled: false }, base, [], []))
        .toEqual({ resolution: '1080P' });
    }
  });
});
