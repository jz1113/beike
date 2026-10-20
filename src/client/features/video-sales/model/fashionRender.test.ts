import { describe, expect, it } from 'vitest';
import { fashionReferenceOrder } from '@shared/domain/video-sales';
import { fashionSubmitError, prepareFashionStills } from './fashionRender';

describe('fashion video submit', () => {
  const references = fashionReferenceOrder({
    personUrl: 'https://example.com/person.jpg',
    faceUrl: 'https://example.com/face.jpg',
    garmentUrl: 'https://example.com/coat.jpg',
    sceneUrl: 'https://example.com/room.jpg',
  });

  it('rejects a model that cannot take the reference count or duration', () => {
    expect(fashionSubmitError({
      modelId: 'veo3.1',
      prompt: '整段提示词',
      references,
      duration: 15,
      resolution: '720P',
      aspectRatio: '9:16',
    })).toMatch(/3 张|时长/);
    expect(fashionSubmitError({
      modelId: 'veo3.1',
      prompt: '整段提示词',
      references: [references[0], references[2]],
      duration: 15,
      resolution: '720P',
      aspectRatio: '9:16',
    })).toMatch(/时长/);
  });

  it('draws the person and scene from their own prompts', async () => {
    const prompts: string[] = [];
    const frames = await prepareFashionStills({
      personPrompt: '实拍人物',
      scenePrompt: '实拍客厅',
      personRefs: ['https://example.com/person.jpg', 'https://example.com/face.jpg'],
      sceneRefs: [],
      imageModel: 'gpt-image',
      aspectRatio: '9:16',
      isAborted: () => false,
      generateFrame: async (input) => {
        prompts.push(`${input.prompt}:${(input.referenceImages || []).length}`);
        return `https://frame/${input.prompt}`;
      },
    });
    expect(prompts).toEqual(['实拍人物:2', '实拍客厅:0']);
    expect(frames).toEqual({ personFrameUrl: 'https://frame/实拍人物', sceneFrameUrl: 'https://frame/实拍客厅' });
    const saved = await prepareFashionStills({
      personPrompt: '实拍人物',
      scenePrompt: '实拍客厅',
      personFrameUrl: 'https://saved-person.jpg',
      sceneFrameUrl: 'https://saved-room.jpg',
      personRefs: ['https://example.com/person.jpg'],
      sceneRefs: [],
      imageModel: 'gpt-image',
      aspectRatio: '9:16',
      isAborted: () => false,
      generateFrame: async () => { throw new Error('不应重画'); },
    });
    expect(saved.personFrameUrl).toBe('https://saved-person.jpg');
    expect(saved.sceneFrameUrl).toBe('https://saved-room.jpg');
  });

  it('asks for the full prompt before checking the model', () => {
    expect(fashionSubmitError({
      modelId: 'veo3.1',
      prompt: '  ',
      references: references.slice(0, 2),
      duration: 8,
      resolution: '720P',
      aspectRatio: '9:16',
    })).toMatch(/完整视频提示词/);
  });
});
