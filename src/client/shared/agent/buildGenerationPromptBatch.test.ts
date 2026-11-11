import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGenerationPromptBatch, type BatchGenerationSettings } from './buildGenerationPromptBatch';
import { prepareAssistantImagePrompt, prepareBatchVideoPrompt } from './batchReferences';
import type { GenerationPromptEntry } from '@shared/domain/assistant/generationPrompts';

vi.mock('@shared/domain/models/modalityStorage', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shared/domain/models/modalityStorage')>(),
  upstreamModalityModelId: (_kind: string, id: string) => id === 'image-channel' ? 'gpt-image-2' : id,
  modalityPickerSelections: (kind: string) => kind === 'image'
    ? [
        { id: 'image-channel', name: '图片渠道', modelId: 'gpt-image-2' },
        { id: 'nano-banana-2', name: 'Nano Banana 2', modelId: 'nano-banana-2' },
      ]
    : [{ id: 'doubao-seedance-2.0-mini', name: '视频渠道', modelId: 'doubao-seedance-2.0-mini' }],
}));

const settings: BatchGenerationSettings = {
  imageModel: 'image-channel', imageAspect: '3:4', imageQuality: 'high',
  videoModel: 'doubao-seedance-2.0-mini', videoAspect: '9:16', videoResolution: '480P', videoDuration: 5, videoRefMode: 'text',
};
const image: GenerationPromptEntry = { id: 'entry-1', title: '封面', prompt: '自然光影，产品居中', mediaType: 'image', aspect: '3:4' };

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});

describe('batch generation task preparation', () => {
  it('creates unique IDs in the same millisecond and preserves model routes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const a = buildGenerationPromptBatch([image, { ...image, id: 'entry-2' }], [], settings);
    const b = buildGenerationPromptBatch([image], [], settings);
    expect(new Set([...a, ...b].map(task => task.id)).size).toBe(3);
    expect(a[0].batchId).toBe(a[1].batchId);
    expect(a[0]).toMatchObject({ model: 'gpt-image-2', modelRouteKey: 'image-channel', mediaType: 'image', progress: '0%' });
    vi.restoreAllMocks();
  });
  it('supports different image and video prompts in the same batch', () => {
    const tasks = buildGenerationPromptBatch([image, { id: 'video', title: '视频', prompt: '镜头缓慢向前', mediaType: 'video', duration: 5 }], [], settings);
    expect(tasks.map(task => task.mediaType)).toEqual(['image', 'video']);
    expect(tasks[1]).toMatchObject({ videoDuration: 5, videoRefMode: 'text', videoResolution: '480P' });
  });
  it('changes GPT generation quality independently of pixel dimensions and preserves the Gemini 512px choice', () => {
    const [standard] = buildGenerationPromptBatch([image], [], { ...settings, imageQuality: 'medium', imageQualityTier: 'high' });
    const [draft] = buildGenerationPromptBatch([image], [], { ...settings, imageQuality: 'medium', imageQualityTier: 'low' });
    expect(draft).toMatchObject({ size: standard.size, quality: 'medium', imageQuality: 'low' });
    const [gemini] = buildGenerationPromptBatch([image], [], { ...settings, imageModel: 'nano-banana-2', imageQuality: '512px' });
    expect(gemini).toMatchObject({ quality: '512px', size: '448x600' });
    expect(gemini.imageQuality).toBeUndefined();
  });
  it('uses valid output parameters for older Seedance Mini drafts and preserves mute', () => {
    const [task] = buildGenerationPromptBatch([
      { ...image, id: 'video', mediaType: 'video', aspect: '9:16', duration: 30 },
    ], [], { ...settings, videoResolution: '1080P', videoGenerateAudio: false });
    expect(task).toMatchObject({ size: '9:16', videoDuration: 15, videoResolution: '480P', generateAudio: false });
  });
  it('validates every item and never returns a partial batch', () => {
    expect(() => buildGenerationPromptBatch([image, { ...image, id: 'missing', prompt: '参考 @图片3' }], [], settings)).toThrow('@图片3');
    expect(() => buildGenerationPromptBatch([image], [], { ...settings, imageModel: 'disabled-channel' })).toThrow('未启用');
  });
  it('checks first/last frame requirements instead of substituting media', () => {
    const video = { ...image, mediaType: 'video' as const };
    expect(() => buildGenerationPromptBatch([video], [{ type: 'image', url: 'https://example.com/a.jpg' }], { ...settings, videoRefMode: 'first_last_frame' })).toThrow('两张图片');
  });
  it('rejects duplicates and dependent tasks', () => {
    expect(() => buildGenerationPromptBatch([image, image], [], settings)).toThrow('重复');
    expect(() => buildGenerationPromptBatch([{ ...image, prompt: '使用上面生成的图片', issue: '依赖未补齐' }], [], settings)).toThrow('依赖未补齐');
  });
});

describe('original reference numbering', () => {
  const media = [{ type: 'image' as const, url: 'https://example.com/one.jpg' }, { type: 'video' as const, url: 'https://example.com/ref.mp4' }, { type: 'image' as const, url: 'https://example.com/two.jpg' }];
  it('renumbers image references without replacing video posters', () => {
    expect(prepareAssistantImagePrompt('@图片3', media)).toEqual({ prompt: '@图片1', urls: [media[2].url] });
    expect(() => prepareAssistantImagePrompt('@图片2', media)).toThrow('@图片2');
  });
  it('numbers video and image references independently and preserves explicit selection', () => {
    expect(prepareBatchVideoPrompt('@图片2 与 @视频1', media, [1, 2])).toMatchObject({ prompt: '@图片1 与 @视频1', urls: [media[2].url, media[1].url] });
    expect(() => prepareBatchVideoPrompt('@图片1', media, [2])).toThrow('勾选');
  });
});
