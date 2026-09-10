import { describe, expect, it } from 'vitest';
import {
  buildPromptBarGenerationTasks,
  buildPromptBarSubjects,
  canSubmitPromptBar,
  type PromptBarSubmitInput,
} from '../utils/promptBarSubmit';
import type { SubjectItem } from '../data/promptBarConstants';
import { registerRefMedia, unregisterRefMedia } from '@/lib/refMediaRegistry';
import { resolveSubjectByMention } from '../components/prompt-bar/RichPromptInput';

function makeInput(overrides: Partial<PromptBarSubmitInput> = {}): PromptBarSubmitInput {
  return {
    quickGenMode: 'image',
    quickPrompt: '',
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
    quickVideoModel: 'doubao-seedance-2.5',
    sizeStr: '1024x1024',
    quickQuality: '4K',
    quickVideoAspectId: '16:9',
    quickVideoResolution: '720P',
    quickVideoDuration: 5,
    currentView: 'home',
    hasImageModels: true,
    quickDepthStyle: 'mocap',
    quickDepthQuality: 'standard',
    refMediaFile: null,
    depthModelReady: true,
    ...overrides,
  };
}

describe('canSubmitPromptBar', () => {
  it('allows video submit with only last frame in first_last_frame mode', () => {
    const input = makeInput({
      quickGenMode: 'video',
      quickVideoRefMode: 'first_last_frame',
      quickVideoLastFrame: 'data:image/png;base64,last',
    });
    expect(canSubmitPromptBar(input)).toBe(true);
  });

  it('allows video submit with only multi frames', () => {
    const input = makeInput({
      quickGenMode: 'video',
      quickVideoRefMode: 'multi_frame',
      quickVideoMultiFrames: ['data:image/png;base64,a'],
    });
    expect(canSubmitPromptBar(input)).toBe(true);
  });

  it('blocks image submit when no models configured', () => {
    const input = makeInput({
      quickPrompt: 'hello',
      hasImageModels: false,
    });
    expect(canSubmitPromptBar(input)).toBe(false);
  });

  it('blocks submit while isSubmitting', () => {
    const input = makeInput({
      quickPrompt: 'hello',
      isSubmitting: true,
    });
    expect(canSubmitPromptBar({ ...input, isSubmitting: true })).toBe(false);
  });
});

describe('buildPromptBarSubjects', () => {
  it('names ref images with their original file names (extension stripped)', () => {
    const subjects = buildPromptBarSubjects({
      customSubjects: [],
      quickRefImages: ['data:image/png;base64,a', 'data:image/png;base64,b'],
      refImageNames: {
        'data:image/png;base64,a': 'pink_suit.png',
        'data:image/png;base64,b': 'cyber_girl',
      },
    });
    expect(subjects).toHaveLength(2);
    expect(subjects[0].name).toBe('pink_suit');
    expect(subjects[1].name).toBe('cyber_girl');
  });

  it('falls back to 1, 2 when no original name is provided', () => {
    const subjects = buildPromptBarSubjects({
      customSubjects: [],
      quickRefImages: ['data:image/png;base64,a', 'data:image/png;base64,b'],
      refImageNames: {},
    });
    expect(subjects).toHaveLength(2);
    expect(subjects[0].name).toBe('1');
    expect(subjects[1].name).toBe('2');
  });

  it('dedupes custom subjects already present in quickRefImages and keeps name', () => {
    const url = 'data:image/png;base64,a';
    const subjects = buildPromptBarSubjects({
      customSubjects: [{ id: 'custom-1', name: '模特特写', url }],
      quickRefImages: [url],
      refImageNames: {},
    });
    expect(subjects).toHaveLength(1);
    expect(subjects[0].name).toBe('模特特写');
  });

  it('resolves original file name from media registry when refImageNames is empty', () => {
    const url = 'blob:test-file-url-1';
    const fakeFile = new File(['fake'], 'Cyberpunk_Outfit.jpg', { type: 'image/jpeg' });
    registerRefMedia(url, fakeFile, 'Cyberpunk_Outfit');

    const subjects = buildPromptBarSubjects({
      customSubjects: [],
      quickRefImages: [url],
      refImageNames: {},
    });

    expect(subjects).toHaveLength(1);
    expect(subjects[0].name).toBe('Cyberpunk_Outfit');
    unregisterRefMedia(url);
  });
});

describe('buildPromptBarGenerationTasks', () => {
  it('does not include stale activeSubjects when mentions were removed', () => {
    const ghost: SubjectItem = {
      id: 'ghost',
      name: 'ghost.png',
      url: 'data:image/png;base64,ghost',
    };
    const input = makeInput({
      quickPrompt: 'text only',
      quickRefImages: [],
      activeSubjects: [ghost],
      allSubjects: [ghost],
    });
    const result = buildPromptBarGenerationTasks(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tasks[0].referenceImages).toBeUndefined();
      expect(result.tasks[0].useReferenceImage).toBe(false);
    }
  });

  it('uses first and last frames only in first_last_frame video mode', () => {
    const input = makeInput({
      quickGenMode: 'video',
      quickVideoRefMode: 'first_last_frame',
      quickVideoFirstFrame: 'data:image/png;base64,first',
      quickVideoLastFrame: 'data:image/png;base64,last',
      quickRefImages: ['data:image/png;base64,ignored'],
      quickPrompt: 'motion',
    });
    const result = buildPromptBarGenerationTasks(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tasks[0].referenceImages).toEqual([
        'data:image/png;base64,first',
        'data:image/png;base64,last',
      ]);
    }
  });

  it('uses multi frames in multi_frame video mode', () => {
    const frames = ['data:image/png;base64,a', 'data:image/png;base64,b'];
    const input = makeInput({
      quickGenMode: 'video',
      quickVideoRefMode: 'multi_frame',
      quickVideoMultiFrames: frames,
      quickRefImages: ['data:image/png;base64,ignored'],
    });
    const result = buildPromptBarGenerationTasks(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tasks[0].referenceImages).toEqual(frames);
    }
  });

  it('merges mention-resolved refs with quickRefImages in image mode', () => {
    const sub: SubjectItem = {
      id: 'ref-0',
      name: 'cat.jpg',
      url: 'data:image/png;base64,cat',
    };
    const input = makeInput({
      quickPrompt: 'draw @图片1',
      quickRefImages: [sub.url],
      allSubjects: [sub],
    });
    const result = buildPromptBarGenerationTasks(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tasks[0].referenceImages).toContain(sub.url);
    }
  });

  it('normalizes custom depth_mocap mention to @图片1 in outbound prompt', () => {
    const sub: SubjectItem = {
      id: 'ref-0',
      name: 'depth_mocap_178833427',
      url: 'data:image/png;base64,depth',
    };
    const input = makeInput({
      quickPrompt: '使用 @depth_mocap_178833427 生成',
      quickRefImages: [sub.url],
      allSubjects: [sub],
    });
    const result = buildPromptBarGenerationTasks(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tasks[0].prompt).toContain('@图片1');
      expect(result.tasks[0].prompt).not.toContain('@depth_mocap_178833427');
    }
  });

  it('blocks submit when mention cannot be resolved to a reference image', () => {
    const input = makeInput({
      quickPrompt: '使用 @missing_subject 生成',
      quickRefImages: [],
      allSubjects: [],
    });
    expect(canSubmitPromptBar(input)).toBe(false);
    const result = buildPromptBarGenerationTasks(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('@missing_subject');
    }
  });

  it('builds depth image task with fixed model, style and quality', () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = makeInput({
      quickGenMode: 'depth-image',
      quickRefImages: ['data:image/png;base64,abc'],
      refMediaFile: file,
      quickDepthStyle: 'turbo',
      quickDepthQuality: 'high',
    });
    const result = buildPromptBarGenerationTasks(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].mediaType).toBe('depth-image');
      expect(result.tasks[0].model).toBe('image-depth-anything');
      expect(result.tasks[0].depthStyle).toBe('turbo');
      expect(result.tasks[0].quality).toBe('high');
      expect(result.tasks[0].prompt).toBe('深度图片');
    }
  });

  it('requires media file for depth video submit', () => {
    const input = makeInput({
      quickGenMode: 'depth-video',
      quickRefImages: ['blob:video'],
      refMediaFile: null,
    });
    expect(canSubmitPromptBar(input)).toBe(false);
    const result = buildPromptBarGenerationTasks(input);
    expect(result.ok).toBe(false);
  });

  it('blocks depth submit when model not ready', () => {
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    const input = makeInput({
      quickGenMode: 'depth-video',
      quickRefImages: ['blob:video'],
      refMediaFile: file,
      depthModelReady: false,
    });
    expect(canSubmitPromptBar(input)).toBe(false);
  });

  it('allows depth video submit with blob url and extension-only mov file', () => {
    const file = new File(['x'], 'clip.mov', { type: '' });
    const input = makeInput({
      quickGenMode: 'depth-video',
      quickRefImages: ['blob:abc-123'],
      refMediaFile: file,
    });
    expect(canSubmitPromptBar(input)).toBe(true);
    const result = buildPromptBarGenerationTasks(input);
    expect(result.ok).toBe(true);
  });

  describe('resolveSubjectByMention 内联解析', () => {
    it('正确解析数字标号 @1, @2, @6', () => {
      const subjects = [
        { id: 'ref-0', name: '1', url: 'blob:img-1' },
        { id: 'ref-1', name: '2', url: 'blob:img-2' },
        { id: 'ref-2', name: '3', url: 'blob:img-3' },
      ];
      expect(resolveSubjectByMention('@1', subjects)?.url).toBe('blob:img-1');
      expect(resolveSubjectByMention('@2', subjects)?.url).toBe('blob:img-2');
      expect(resolveSubjectByMention('@3', subjects)?.url).toBe('blob:img-3');
    });

    it('正确解析原名 @cyber_girl', () => {
      const subjects = [
        { id: 'ref-0', name: 'cyber_girl', url: 'blob:img-cyber' },
      ];
      expect(resolveSubjectByMention('@cyber_girl', subjects)?.url).toBe('blob:img-cyber');
    });
  });
});
