import { describe, expect, it } from 'vitest';
import { actionMedia, depthFileError, seedanceVideoDurationError } from './salesActionMedia';
import {
  cleanActionTags, isMachineGeneratedActionTitle, nextSequentialActionName,
  salesMaterialCards, toggleTagInList,
} from './salesMaterialCatalog';

const base = { id: 'old', title: '旧动作', action: '转身', shotType: '', camera: '', tags: '', coverUrl: '/old.jpg' };
describe('action media catalog', () => {
  it('keeps historical image references and classifies video/depth media independently', () => {
    expect(actionMedia(base)).toEqual({ type: 'image', url: '/old.jpg', video: false });
    const cards = salesMaterialCards({ personas: [], scenes: [], voices: [], bgms: [], actions: [base,
      { ...base, id: 'v', mediaType: 'video', mediaUrl: '/motion.mp4', coverUrl: '' },
      { ...base, id: 'di', mediaType: 'depth-image', mediaUrl: '/depth.png', sourceUrl: '/old.jpg' },
      { ...base, id: 'dv', mediaType: 'depth-video', mediaUrl: '/depth.mp4', coverUrl: '' },
    ] });
    expect(cards.map((c) => c.badge)).toEqual(['图片', '视频', '深度图片', '深度视频']);
    expect(cards[1].video).toBe('/motion.mp4');
    expect(cards[2].image).toBe('/depth.png');
    expect(cards[2].sourceUrl).toBe('/old.jpg');
    expect(cards[3].image).toBe('');
  });

  it('numbers machine-generated hash titles as 1, 2, 3 and strips system noise tags', () => {
    expect(isMachineGeneratedActionTitle('01eae4aae15dd2254f037001a18d3e65a4_520 · 深度')).toBe(true);
    expect(isMachineGeneratedActionTitle('转身展示')).toBe(false);
    expect(nextSequentialActionName([])).toBe('1');
    expect(nextSequentialActionName([{ title: '1' }, { title: '2' }])).toBe('3');
    expect(cleanActionTags('中景, iPhone 50mm 生活镜头, 深度动作, mocap, standard, 转身展示')).toEqual(['转身展示']);
    expect(toggleTagInList('转身展示', '走秀台步')).toBe('转身展示，走秀台步');
    expect(toggleTagInList('转身展示，走秀台步', '转身展示')).toBe('走秀台步');

    const cards = salesMaterialCards({
      personas: [], scenes: [], voices: [], bgms: [],
      actions: [
        {
          ...base,
          id: 'hash-1',
          title: '01eae4aae15dd2254f037001a18d3e65a4_520 · 深度',
          shotType: '中景',
          camera: 'iPhone 50mm 生活镜头',
          tags: '深度动作,mocap,standard,转身展示',
          mediaType: 'depth-video',
          mediaUrl: '/depth.mp4',
        },
      ],
    });
    expect(cards[0].title).toBe('1');
    expect(cards[0].tags).toEqual(['转身展示']);
    expect(cards[0].subBadge).toBeUndefined();
  });

  it('rejects wrong, empty, oversized and out-of-range video duration conversion inputs before uploading', () => {
    expect(depthFileError(new File(['video'], 'motion.mp4'), true)).toBe('');
    expect(depthFileError(new File(['image'], 'pose.png'), false)).toBe('');
    expect(depthFileError(new File(['x'], 'x.txt'), true)).toContain('请选择');
    expect(depthFileError(new File([], 'empty.png'), false)).toContain('为空');
    expect(depthFileError({ name: 'big.mp4', size: 36 * 1024 * 1024 } as File, true)).toContain('35MB');
    expect(seedanceVideoDurationError(1.5)).toContain('2 ~ 30 秒');
    expect(seedanceVideoDurationError(32)).toContain('2 ~ 30 秒');
    expect(seedanceVideoDurationError(8)).toBe('');
  });
});
