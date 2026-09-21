export interface ReservedArtDirection {
  id: string;
  label: string;
  description: string;
}

// These are de-duplication reservations, not fixed product templates. The
// director still adapts scene/material to the product, but repeated source
// images must not collapse to the same type-and-colour treatment.
export const RESERVED_ART_DIRECTIONS: readonly ReservedArtDirection[] = [
  { id: 'yellow-crimson-block', label: '亮黄酒红块字', description: '亮黄压缩厚块字，近黑厚描边，酒红短硬偏移阴影' },
  { id: 'ivory-wine-editorial', label: '暖白酒红编辑字', description: '暖白紧凑编辑粗字，深酒红描边，黑色柔短投影' },
  { id: 'electric-blue-slant', label: '电蓝银白斜切字', description: '电光蓝与银白斜切速度字，深海军蓝描边，蓝色速度拖影' },
  { id: 'vermilion-cream-round', label: '朱红奶油圆厚字', description: '朱红圆厚综艺字，奶油白描边，深色偏移阴影' },
  { id: 'lime-ink-offset', label: '黄绿错位压缩字', description: '酸性黄绿压缩黑体，近黑描边，错位字组和硬朗阴影' },
  { id: 'orange-cream-impact', label: '橙红奶油冲击字', description: '橙红厚重冲击字，奶油描边，低角度深棕投影' },
  { id: 'ink-magenta-editorial', label: '近黑洋红编辑字', description: '近黑编辑粗字，洋红单一色面或笔刷块，不使用描边' },
  { id: 'cream-brown-warm', label: '奶油深棕生活字', description: '奶油白宽厚字，深棕细描边，暖橙自然投影' },
  { id: 'pink-plum-round', label: '粉白梅紫圆厚字', description: '粉白圆厚字，梅紫描边，轻微紫红偏移阴影' },
  { id: 'cobalt-silver-tech', label: '冷白钴蓝器材字', description: '冷白窄体器材字，钴蓝描边，银灰金属高光' },
  { id: 'teal-cream-brush', label: '青绿奶油笔刷字', description: '深青绿粗字，奶油细描边，一处青绿色笔刷强调完整词组' },
  { id: 'purple-yellow-sport', label: '紫黄运动斜黑字', description: '明亮紫色斜黑体，亮黄外描边，近黑短硬阴影' },
] as const;

function hash(value: string): number {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

export function sourceKey(url: string): string {
  try {
    const parsed = new URL(url.trim());
    // CDN resize/signing parameters should not turn the same source product
    // into a new typography group.
    return `${parsed.origin.toLowerCase()}${parsed.pathname}`;
  } catch {
    return url.trim().replace(/[?#].*$/, '');
  }
}

export function reservedArtDirectionFor(sourceImageUrl: string, occurrence: number): ReservedArtDirection {
  const sourceOffset = hash(sourceKey(sourceImageUrl)) % RESERVED_ART_DIRECTIONS.length;
  return RESERVED_ART_DIRECTIONS[(sourceOffset + occurrence) % RESERVED_ART_DIRECTIONS.length];
}
