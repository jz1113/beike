import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareGenerationAttempt } from '@client/shared/media/generationAttempt';
import { isTaskVideoReference } from '@client/shared/media/mediaHelper';
import { registerRefMediaKind, unregisterRefMedia } from '@client/shared/media/refMediaRegistry';
import { resolvePromptPlaceholder } from './promptBarDisplay';
import { buildPromptBarGenerationTasks, buildPromptBarSubjects, canSubmitPromptBar, type PromptBarSubmitInput } from './promptBarSubmit';

afterEach(() => vi.unstubAllGlobals());

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
  it('remembers which library reference is a video after its URL registry is gone', () => {
    const still = '/storage/blue-train.png';
    const clip = '/storage/library/opaque-clip';
    registerRefMediaKind(clip, 'video');
    try {
      const result = buildPromptBarGenerationTasks({ ...input('home'), quickGenMode: 'video',
        quickVideoModel: 'doubao-seedance-2.0-mini', quickRefImages: [still, clip] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const archived = JSON.parse(JSON.stringify(result.tasks[0]));
      unregisterRefMedia(clip);
      expect(isTaskVideoReference(archived, clip)).toBe(true);
      expect(isTaskVideoReference(archived, still)).toBe(false);
    } finally {
      unregisterRefMedia(clip);
    }
  });

  it('keeps later image and video generations in the current conversation or canvas', () => {
    const generate = buildPromptBarGenerationTasks(input('generate'));
    const canvas = buildPromptBarGenerationTasks({ ...input('canvas'), quickGenMode: 'video', quickPrompt: '镜头推进' });
    const home = buildPromptBarGenerationTasks(input('home'));
    expect(generate.ok && generate.shouldCreateNewSession).toBe(false);
    expect(canvas.ok && canvas.shouldCreateNewSession).toBe(false);
    expect(home.ok && home.shouldCreateNewSession).toBe(true);
  });

  it.each(['FAILURE', 'SUCCESS'] as const)('preserves the home prompt and references on a new attempt after %s', async (status) => {
    const prompt = '杯子向右旋转\n镜头向左平移';
    const refs = ['/storage/cup.png'];
    const result = buildPromptBarGenerationTasks({ ...input('home'), quickPrompt: prompt, quickRefImages: refs });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const task = result.tasks[0];
    expect(task.prompt).toBe(prompt);
    const original = { ...task, status, usageScope: { workspaceId: 'previous-workspace', channelId: 'previous-channel', mediaType: 'image' } };
    const retry = await prepareGenerationAttempt(original, 'retry');
    expect(retry?.id).not.toBe(task.id);
    expect(retry?.prompt).toBe(prompt);
    expect(retry?.referenceImages).toEqual(refs);
    expect(retry?.usageScope).toBeUndefined();
    expect(original.usageScope.channelId).toBe('previous-channel');
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

  it('snapshots audio preferences before queued work, storage and retries', async () => {
    let audio = { format: 'wav', voice: 'saved-voice', speed: 0.8 };
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ audio }) });
    const result = buildPromptBarGenerationTasks({ ...input('home'), quickGenMode: 'audio' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    audio = { format: 'mp3', voice: 'changed-voice', speed: 1.5 };
    const task = JSON.parse(JSON.stringify(result.tasks[0]));
    expect(task).toMatchObject({ audioFormat: 'wav', audioVoice: 'saved-voice', audioSpeed: 0.8 });
    const retry = await prepareGenerationAttempt({ ...task, status: 'FAILURE' }, 'retry');
    expect(retry).toMatchObject({ audioFormat: 'wav', audioVoice: 'saved-voice', audioSpeed: 0.8 });
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

describe('resolvePromptPlaceholder', () => {
  it('returns empty placeholder in agent mode', () => {
    expect(
      resolvePromptPlaceholder({
        isDepthMode: false,
        quickGenMode: 'agent',
        quickVideoRefMode: 'omni',
        isGenerateDock: false,
      }),
    ).toBe('');
  });
});

describe('buildPromptBarSubjects', () => {
  it('excludes agent-file attachments from @ mention subjects', () => {
    const subjects = buildPromptBarSubjects({
      customSubjects: [],
      quickRefImages: ['agent-file:doc-1', 'data:image/png;base64,AAA'],
      refImageNames: {},
    });
    expect(subjects).toEqual([
      { id: 'ref-1', url: 'data:image/png;base64,AAA', name: '1' },
    ]);
  });
});


it('builds a direct collection task without a configured model', () => {
  const request = { ...input('home'), quickGenMode: 'collect' as const, quickPrompt: '10231557417974', hasImageModels: false };
  expect(canSubmitPromptBar(request)).toBe(true);
  const result = buildPromptBarGenerationTasks(request);
  expect(result.ok && result.tasks[0]).toMatchObject({ model: 'direct-collection', mediaType: 'agent', prompt: '10231557417974' });
  expect(canSubmitPromptBar({ ...request, quickPrompt: ' ' })).toBe(false);
});
