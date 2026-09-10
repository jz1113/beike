import { describe, it, expect } from 'vitest';
import {
  extractOutfitSignature,
  outfitSimilarity,
  dedupeOutfitCandidates,
} from './outfitDedup';

describe('outfitDedup', () => {
  it('detects high similarity for repeated descriptions of the same outfit', () => {
    const item1 = {
      title: '浅天蓝色修身V领针织开衫与白色高腰百褶裙',
      top: '浅天蓝色修身长袖V领针织开衫，法式贝壳纽扣',
      bottom: '纯白色高腰A字百褶短裙',
      color_palette: '浅蓝, 白色',
    };
    const item2 = {
      title: '浅天蓝针织衫配白色百褶短裙',
      top: '浅蓝色V领长袖针织开衫',
      bottom: '纯白百褶裙',
      color_palette: '浅蓝, 白色',
    };

    const sig1 = extractOutfitSignature(item1);
    const sig2 = extractOutfitSignature(item2);
    const score = outfitSimilarity(sig1, sig2);

    expect(score).toBeGreaterThanOrEqual(0.60);
  });

  it('detects low similarity for distinctly different outfits', () => {
    const itemA = {
      title: '黑色机车皮衣夹克搭配深黑阔腿工装裤',
      top: '纯黑重磅机车牛皮夹克，银色金属拉链',
      bottom: '深黑色多口袋直筒工装裤',
      color_palette: '黑色',
    };
    const itemB = {
      title: '法式复古粉色碎花吊带连衣裙',
      top: '粉色玫瑰小碎花雪纺吊带连衣裙',
      bottom: '双层荷叶边伞状裙摆',
      color_palette: '粉色',
    };

    const sigA = extractOutfitSignature(itemA);
    const sigB = extractOutfitSignature(itemB);
    const score = outfitSimilarity(sigA, sigB);

    expect(score).toBeLessThan(0.35);
  });

  it('merges repeated outfits across multi-image deconstruction into single rich asset', () => {
    const candidates = [
      {
        title: '浅天蓝色修身针织开衫与白色百褶裙',
        top: '浅天蓝色修身长袖V领针织开衫，精致贝壳扣',
        bottom: '纯白色高腰百褶短裙',
        source_image_index: 0,
      },
      {
        title: '浅天蓝针织衫白裙',
        top: '浅蓝色针织衫',
        bottom: '白色短裙',
        source_image_index: 1,
      },
      {
        title: '天蓝色开衫配百褶裙穿搭',
        top: '天蓝色长袖开衫',
        bottom: '纯白色A字百褶裙',
        source_image_index: 2,
      },
      // 另一套截然不同的衣服
      {
        title: '纯黑廓形西装大衣配黑色西裤',
        top: '纯黑色双排扣垫肩西装外套',
        bottom: '黑色垂坠感微喇西装长裤',
        source_image_index: 3,
      },
    ];

    const deduped = dedupeOutfitCandidates(candidates);

    // 应该归纳为 2 套不同服装，而不是 4 套
    expect(deduped.length).toBe(2);

    // 找到合并后的蓝色针织衫套装
    const blueKnitOutfit = deduped.find((o) => String(o.top).includes('针织'));
    expect(blueKnitOutfit).toBeDefined();
    // 应该保留了最详细完整的描述
    expect(blueKnitOutfit?.top).toContain('精致贝壳扣');
    // 聚合了所有出现此套衣服的图片索引
    expect(blueKnitOutfit?.source_image_indices).toEqual([0, 1, 2]);

    // 黑色西装独立保留
    const blackSuitOutfit = deduped.find((o) => String(o.top).includes('西装'));
    expect(blackSuitOutfit).toBeDefined();
    expect(blackSuitOutfit?.source_image_indices).toEqual([3]);
  });
});
