import { describe, expect, it } from 'vitest';
import {
  fashionBeatLabel,
  fashionGarmentIndex,
  fashionReferenceBrief,
  fashionReferenceError,
  fashionFramesForVideo,
  fashionReferenceOrder,
  fashionReferencesForShots,
  readFashionRefs,
} from './fashionRefs';

describe('fashion reference order', () => {
  it('numbers person, optional face, garment, then optional scene', () => {
    const refs = fashionReferenceOrder({
      personUrl: ' https://example.com/person.jpg ',
      faceUrl: 'https://example.com/face.jpg',
      garmentUrl: 'https://example.com/coat.jpg',
      garmentIndex: 2,
      sceneUrl: 'https://example.com/room.jpg',
    });
    expect(refs.map((ref) => ref.slot)).toEqual(['person', 'face', 'garment', 'scene']);
    expect(refs[2].imageIndex).toBe(2);
    expect(fashionReferenceBrief(refs)).toBe('图片1：出镜人物\n图片2：人脸特写\n图片3：服饰单品\n图片4：场景');
  });

  it('drops missing face and scene so they do not take a number', () => {
    const refs = fashionReferenceOrder({
      personUrl: 'https://example.com/person.jpg',
      garmentUrl: 'https://example.com/coat.jpg',
    });
    expect(fashionReferenceBrief(refs)).toBe('图片1：出镜人物\n图片2：服饰单品');
    expect(fashionReferenceError(refs)).toBeNull();
    expect(fashionReferenceError(refs.filter((ref) => ref.slot !== 'person'))).toBe('请上传出镜人物');
  });

  it('reserves the last number for a scene that will be drawn', () => {
    const refs = fashionReferenceOrder({
      personUrl: 'https://example.com/person.jpg',
      garmentUrl: 'https://example.com/coat.jpg',
      reserveScene: true,
    });
    expect(fashionReferenceBrief(refs)).toBe('图片1：出镜人物\n图片2：服饰单品\n图片3：场景');
    expect(refs[2]?.url).toBe('');
    const video = fashionFramesForVideo(refs, {
      personFrameUrl: 'https://example.com/drawn-person.jpg',
      sceneFrameUrl: 'https://example.com/drawn-room.jpg',
    });
    expect(video.map((ref) => ref.url)).toEqual([
      'https://example.com/drawn-person.jpg',
      'https://example.com/coat.jpg',
      'https://example.com/drawn-room.jpg',
    ]);
  });

  it('uses the try-on shot as the garment image', () => {
    const refs = fashionReferencesForShots({
      refs: readFashionRefs({ personUrl: 'https://example.com/person.jpg', sceneUrl: 'https://example.com/room.jpg' }),
      shots: [
        { type: 'hook', imageIndex: 0 },
        { type: 'demo', imageIndex: 1 },
      ],
      catalog: [
        { index: 0, url: 'https://example.com/flat.jpg' },
        { index: 1, url: 'https://example.com/worn.jpg' },
      ],
    });
    expect(fashionGarmentIndex([{ type: 'hook', imageIndex: 0 }, { type: 'demo', imageIndex: 1 }])).toBe(1);
    expect(refs.map((ref) => ref.label)).toEqual(['出镜人物', '服饰单品', '场景']);
    expect(refs[1].url).toBe('https://example.com/worn.jpg');
    expect(fashionBeatLabel('lifestyle')).toBe('生活穿搭');
  });
});
