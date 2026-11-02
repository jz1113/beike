import { describe, expect, it } from 'vitest';
import {
  inferSalesProductAudience,
  inferSalesProductCategory,
  isPersonaCompatibleWithProductAudience,
  matchesProductAudienceFilter,
  resolveSalesProductClassification,
  salesAudienceLabel,
} from './productClassification';

describe('sales product category and age/gender audience classification', () => {
  it('infers product category from title and collected properties', () => {
    expect(inferSalesProductCategory({ productName: '红袖 2026秋季新款女装条纹花纱针织开衫' })).toBe('fashion');
    expect(inferSalesProductCategory({ productName: '雅诗兰黛小棕瓶面部精华液 50ml' })).toBe('beauty');
    expect(inferSalesProductCategory({ productName: '华为 FreeBuds Pro 无线降噪蓝牙耳机' })).toBe('tech');
    expect(inferSalesProductCategory({ productName: '巴拉巴拉女童防风连帽外套 120码' })).toBe('fashion');
    expect(inferSalesProductCategory({ productName: '三顿半冷萃冻干咖啡粉', props: { 净含量: '60g' } })).toBe('food');
    expect(inferSalesProductCategory({ productName: '无印良品纯棉床上四件套' })).toBe('home');
  });

  it('infers age and gender audience across adult, senior, child and unisex products', () => {
    expect(inferSalesProductAudience({ productName: '红袖 2026秋季新款女装条纹花纱针织开衫' })).toBe('adult_female');
    expect(inferSalesProductAudience({ productName: '海澜之家男士商务修身西装外套' })).toBe('adult_male');
    expect(inferSalesProductAudience({ productName: '巴拉巴拉女童碎花连衣裙 6岁夏装' })).toBe('child_female');
    expect(inferSalesProductAudience({ productName: '儿童防晒衣男女童通用薄款' })).toBe('child_unisex');
    expect(inferSalesProductAudience({ productName: '中老年妈妈装奶奶秋装羊毛开衫' })).toBe('senior_female');
    expect(inferSalesProductAudience({ productName: '情侣款纯棉宽松卫衣男女同款' })).toBe('adult_unisex');
    expect(inferSalesProductAudience({ productName: '桌面无线蓝牙音箱' })).toBe('unknown');
    expect(salesAudienceLabel('child_female')).toBe('女童');
  });

  it('preserves manual user overrides when re-collecting product metadata', () => {
    const manual = resolveSalesProductClassification(
      { productName: '新款纯棉宽松T恤', category: 'fashion' },
      { category: 'home', categorySource: 'manual', audience: 'senior_male', audienceSource: 'manual' },
    );
    expect(manual).toEqual({
      category: 'home',
      categorySource: 'manual',
      audience: 'senior_male',
      audienceSource: 'manual',
    });

    const auto = resolveSalesProductClassification(
      { productName: '新款女童纯棉针织开衫' },
      { categorySource: 'auto', audienceSource: 'auto' },
    );
    expect(auto).toEqual({
      category: 'fashion',
      categorySource: 'auto',
      audience: 'child_female',
      audienceSource: 'auto',
    });
  });

  it('matches aggregated product library audience filters and strict persona compatibility', () => {
    expect(matchesProductAudienceFilter('senior_female', 'senior')).toBe(true);
    expect(matchesProductAudienceFilter('child_unisex', 'child')).toBe(true);
    expect(matchesProductAudienceFilter('child_unisex', 'unisex')).toBe(true);
    expect(matchesProductAudienceFilter('adult_female', 'adult_male')).toBe(false);

    const adultFemale = { name: '林夏', description: '法式女装穿搭模特', tags: '女,穿搭' };
    const adultMale = { name: '子轩', description: '商务男装模特', tags: '男,商务' };
    const childGirl = { name: '朵朵', description: '6岁女童童装模特', tags: '女童' };

    expect(isPersonaCompatibleWithProductAudience(adultFemale, 'adult_female')).toBe(true);
    expect(isPersonaCompatibleWithProductAudience(adultMale, 'adult_female')).toBe(false);
    expect(isPersonaCompatibleWithProductAudience(adultFemale, 'adult_male')).toBe(false);
    expect(isPersonaCompatibleWithProductAudience(adultMale, 'adult_unisex')).toBe(true);
    expect(isPersonaCompatibleWithProductAudience(childGirl, 'child_female')).toBe(true);
    expect(isPersonaCompatibleWithProductAudience(adultFemale, 'child_female')).toBe(false);
  });
});

