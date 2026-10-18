import { describe, expect, it } from 'vitest';
import { buildPromptBarGenerationTasks, canSubmitPromptBar, type PromptBarSubmitInput } from './promptBarSubmit';

function input(currentView: string): PromptBarSubmitInput {
  return {
    quickGenMode: 'image',
    quickPrompt: '一只猫',
    quickRefImages: [],
    activeSubjects: [],
    allSubjects: [],
    quickVideoRefMode: 'omni',
    quickVideoFirstFrame: null,
    quickVideoLastFrame: null,
    quickVideoMultiFrames: [],
    quickCount: 1,
    quickVideoCount: 1,
    quickModel: 'gpt-image-2',
    quickVideoModel: 'seedance',
    quickAudioModel: 'speech-2.8-hd',
    sizeStr: '1024x1024',
    quickQuality: 'medium',
    quickVideoAspectId: '1:1',
    quickVideoResolution: '720P',
    quickVideoDuration: 5,
    currentView,
    hasImageModels: true,
    hasVideoModels: true,
    hasAudioModels: true,
    quickDepthStyle: 'mocap',
    quickDepthQuality: 'standard',
  };
}

describe('buildPromptBarGenerationTasks session', () => {
  it('keeps later image and video generations in the current conversation or canvas', () => {
    const generate = buildPromptBarGenerationTasks(input('generate'));
    const canvas = buildPromptBarGenerationTasks({ ...input('canvas'), quickGenMode: 'video', quickPrompt: '镜头推进' });
    const home = buildPromptBarGenerationTasks(input('home'));
    expect(generate.ok && generate.shouldCreateNewSession).toBe(false);
    expect(canvas.ok && canvas.shouldCreateNewSession).toBe(false);
    expect(home.ok && home.shouldCreateNewSession).toBe(true);
  });

  it('correctly creates audio task when mode is audio', () => {
    const audioInput: PromptBarSubmitInput = {
      ...input('home'),
      quickGenMode: 'audio',
      quickPrompt: '欢迎使用贝壳云图进行专业音频创作',
      quickAudioModel: 'cosyvoice-v2',
    };
    const res = buildPromptBarGenerationTasks(audioInput);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.tasks).toHaveLength(1);
      expect(res.tasks[0].mediaType).toBe('audio');
      expect(res.tasks[0].model).toBe('cosyvoice-v2');
      expect(res.tasks[0].prompt).toBe('欢迎使用贝壳云图进行专业音频创作');
    }
  });

  it('validates audio mode submission requirements', () => {
    const valid = canSubmitPromptBar({
      ...input('home'),
      quickGenMode: 'audio',
      quickPrompt: '朗读文本',
      hasAudioModels: true,
    });
    expect(valid).toBe(true);

    const noModel = canSubmitPromptBar({
      ...input('home'),
      quickGenMode: 'audio',
      quickPrompt: '朗读文本',
      hasAudioModels: false,
    });
    expect(noModel).toBe(false);

    const emptyText = canSubmitPromptBar({
      ...input('home'),
      quickGenMode: 'audio',
      quickPrompt: '   ',
      hasAudioModels: true,
    });
    expect(emptyText).toBe(false);
  });
});
