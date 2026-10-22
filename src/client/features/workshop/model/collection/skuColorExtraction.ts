import type { BatchProductItem } from '../batchTypes';

export interface ExtractedSkuInfo {
  color?: string;
  spec?: string;
}

const COMMON_COLOR_REGEX = /(银白灰|深空灰|钛空灰|暗夜黑|曜石黑|幻夜黑|亮黑|磨砂黑|星空黑|羽砂黑|雪域白|凝光白|珍珠白|象牙白|钛金|流光金|香槟金|玫瑰金|土豪金|远峰蓝|海蓝|天蓝|冰蓝|藏青|深蓝|暗夜绿|苍岭绿|墨绿|橄榄绿|薄荷绿|浅绿|暗夜紫|丁香紫|薰衣草紫|樱花粉|活力橙|日落橙|中国红|酒红|银色|灰色|黑色|白色|金色|蓝色|绿色|黄色|橙色|棕色|米色|驼色|咖色|原色钛金属|黑色钛金属|白色钛金属|蓝色钛金属|灰色|白色|黑色|金色|银色|粉色|紫色|蓝色|绿色|黄色|橙色)/;

const COMMON_SPEC_REGEX = /(官方标配|标配|高配|顶配|尊享版|标准版|套装[1-9一二三四]?|\d+[\+\*xX]\d+[Gg]?[Bb]?|\d+[Gg][Bb]|\d+[Tt][Bb])/;

/**
 * 从商品的 props、variantMetadata 或标题中智能解析出当前 SKU 的颜色与规格
 */
export function extractProductSkuInfo(item: Pick<BatchProductItem, 'props' | 'title' | 'itemId'> & { variantMetadata?: any }): ExtractedSkuInfo {
  const props = item.props || {};

  // 1. 优先从 props 中的颜色字段读取
  const colorKeys = [
    '机身颜色',
    '颜色',
    '颜色分类',
    '外观颜色',
    '主色调',
    '主色',
    '款式',
    '选择颜色',
    '颜色/款式',
  ];

  let color: string | undefined;
  for (const key of colorKeys) {
    const val = props[key];
    if (typeof val === 'string' && val.trim()) {
      color = val.trim();
      break;
    }
  }

  // 2. 规格/配置字段
  const specKeys = [
    '版本',
    '存储容量',
    '配置',
    '规格',
    '套餐',
    '套餐类型',
    '网络类型',
    '机身内存',
    '运行内存',
  ];

  let spec: string | undefined;
  for (const key of specKeys) {
    const val = props[key];
    if (typeof val === 'string' && val.trim()) {
      spec = val.trim();
      break;
    }
  }

  // 3. 从 variantMetadata 中查找与当前 itemId 匹配的变体
  if (item.variantMetadata && Array.isArray(item.variantMetadata.variants)) {
    const matched = item.variantMetadata.variants.find((v: any) =>
      v.skuIds?.includes(item.itemId) || v.id === item.itemId || v.id === item.variantMetadata?.requestedSkuId
    );
    if (matched) {
      if (!color && (matched.color || matched.label)) {
        const clean = (matched.color || matched.label).replace(/^颜色[:：]\s*/, '').trim();
        if (clean && clean !== '未知') {
          color = clean;
        }
      }
    }
  }

  // 4. 从商品标题中分析提取（电商标题末尾通常带有独立款式与规格，例如："魅族精选... 银白灰 官方标配8+128G"）
  if (item.title) {
    const segments = item.title.trim().split(/\s+/);
    if (segments.length >= 2) {
      const last = segments[segments.length - 1];
      const secondLast = segments[segments.length - 2];

      if (!color) {
        if (COMMON_COLOR_REGEX.test(secondLast)) {
          const match = secondLast.match(COMMON_COLOR_REGEX);
          color = match ? match[0] : secondLast;
        } else if (COMMON_COLOR_REGEX.test(last) && !COMMON_SPEC_REGEX.test(last)) {
          const match = last.match(COMMON_COLOR_REGEX);
          color = match ? match[0] : last;
        }
      }

      if (!spec) {
        if (COMMON_SPEC_REGEX.test(last)) {
          spec = last;
        } else if (COMMON_SPEC_REGEX.test(secondLast) && color !== secondLast) {
          spec = secondLast;
        }
      }
    } else if (segments.length === 1 && !color) {
      // 标题未分词但包含明确颜色词
      const match = item.title.match(COMMON_COLOR_REGEX);
      if (match) {
        color = match[0];
      }
    }
  }

  return { color, spec };
}
