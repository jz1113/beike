/**
 * Google Gemini / Nano Banana 原生图像生成尺寸、宽高比与分辨率规则
 * 参考官方文档：https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn#aspect_ratios
 */

export type GeminiImageSizeTier = '512px' | '1K' | '2K' | '4K';

export const GEMINI_MAX_REFERENCE_IMAGES = 14;

/** Nano Banana Pro / 2 Lite / 2.5 Flash 支持的 10 种标准宽高比 */
export const GEMINI_STANDARD_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const;

/** Nano Banana 2.1 / 3.1 Flash 支持的 14 种宽高比（新增 1:4, 1:8, 4:1, 8:1） */
export const GEMINI_EXTENDED_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
] as const;

/** Nano Banana 2.1 / 3.1 Flash / 3 Pro 官方像素尺寸表：[512px, 1K, 2K, 4K] */
export const GEMINI_3_OFFICIAL_SIZES: Record<string, readonly [string, string, string, string]> = {
  '1:1': ['512x512', '1024x1024', '2048x2048', '4096x4096'],
  '1:4': ['256x1024', '512x2048', '1024x4096', '2048x8192'],
  '1:8': ['192x1536', '384x3072', '768x6144', '1536x12288'],
  '2:3': ['424x632', '848x1264', '1696x2528', '3392x5056'],
  '3:2': ['632x424', '1264x848', '2528x1696', '5056x3392'],
  '3:4': ['448x600', '896x1200', '1792x2400', '3584x4800'],
  '4:1': ['1024x256', '2048x512', '4096x1024', '8192x2048'],
  '4:3': ['600x448', '1200x896', '2400x1792', '4800x3584'],
  '4:5': ['464x576', '928x1152', '1856x2304', '3712x4608'],
  '5:4': ['576x464', '1152x928', '2304x1856', '4608x3712'],
  '8:1': ['1536x192', '3072x384', '6144x768', '12288x1536'],
  '9:16': ['384x688', '768x1376', '1536x2752', '3072x5504'],
  '16:9': ['688x384', '1376x768', '2752x1536', '5504x3072'],
  '21:9': ['792x168', '1584x672', '3168x1344', '6336x2688'],
};

/** Gemini 2.5 Flash Image (Nano Banana 1) 官方像素尺寸表 */
export const GEMINI_25_OFFICIAL_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '2:3': '832x1248',
  '3:2': '1248x832',
  '3:4': '864x1184',
  '4:3': '1184x864',
  '4:5': '896x1152',
  '5:4': '1152x896',
  '9:16': '768x1344',
  '16:9': '1344x768',
  '21:9': '1536x672',
};

const PIXEL_TO_ASPECT = new Map<string, string>();
for (const [ratio, sizes] of Object.entries(GEMINI_3_OFFICIAL_SIZES)) {
  for (const size of sizes) PIXEL_TO_ASPECT.set(size, ratio);
}
for (const [ratio, size] of Object.entries(GEMINI_25_OFFICIAL_SIZES)) {
  PIXEL_TO_ASPECT.set(size, ratio);
}

export function isGeminiImageModel(modelId?: string): boolean {
  const id = (modelId || '').trim().toLowerCase();
  if (!id) return false;
  return (
    id.includes('nano-banana') ||
    id.includes('nanobanana') ||
    (id.includes('gemini') && (id.includes('image') || id.includes('banana')))
  );
}

export function isGeminiLiteImageModel(modelId?: string): boolean {
  const id = (modelId || '').trim().toLowerCase();
  return id.includes('flash-lite') || id.includes('banana-2-lite') || id.includes('banana-lite');
}

export function isGeminiLegacy25ImageModel(modelId?: string): boolean {
  const id = (modelId || '').trim().toLowerCase();
  if (id.includes('2.5-flash-image')) return true;
  if (!id.includes('nano-banana') && !id.includes('nanobanana')) return false;
  if (
    id.includes('2.1') ||
    id.includes('3.1') ||
    id.includes('pro') ||
    id.includes('lite') ||
    id.includes('-hd') ||
    /-(?:1k|2k|4k)$/i.test(id)
  ) {
    return false;
  }
  return !/nano-banana-2(?:$|-)/.test(id);
}

export function geminiSupportsExtendedAspectRatios(modelId?: string): boolean {
  const id = (modelId || '').trim().toLowerCase();
  if (!isGeminiImageModel(id)) return false;
  if (isGeminiLiteImageModel(id) || id.includes('pro') || isGeminiLegacy25ImageModel(id)) return false;
  return id.includes('2.1') || id.includes('3.1-flash') || /nano-banana-2(?:$|-)/.test(id);
}

export function geminiSupportedAspectRatios(modelId?: string): readonly string[] {
  return geminiSupportsExtendedAspectRatios(modelId)
    ? GEMINI_EXTENDED_ASPECT_RATIOS
    : GEMINI_STANDARD_ASPECT_RATIOS;
}

export function geminiSupports512px(modelId?: string): boolean {
  const id = (modelId || '').trim().toLowerCase();
  if (id.includes('2.1') || isGeminiLiteImageModel(id) || id.includes('pro') || isGeminiLegacy25ImageModel(id)) {
    return false;
  }
  return id.includes('3.1-flash-image') || /nano-banana-2(?:$|-)/.test(id);
}

export function geminiSupportedResolutions(modelId?: string): ('1K' | '2K' | '4K')[] {
  const id = (modelId || '').trim().toLowerCase();
  if (/(?:-4k|-hd)$/i.test(id)) return ['4K'];
  if (/-2k$/i.test(id)) return ['2K'];
  if (/-1k$/i.test(id) || isGeminiLiteImageModel(id) || isGeminiLegacy25ImageModel(id)) return ['1K'];
  return ['1K', '2K', '4K'];
}

export function geminiSendsImageSize(modelId?: string): boolean {
  if (!isGeminiImageModel(modelId)) return false;
  return !isGeminiLegacy25ImageModel(modelId);
}

function parseNumericPair(raw: string, sep: RegExp): [number, number] | null {
  const parts = raw.split(sep).map((s) => Number(s.trim()));
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] <= 0 || parts[1] <= 0 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return null;
  }
  return [parts[0], parts[1]];
}

function closestRatio(target: number, candidates: readonly string[]): string {
  let best = candidates[0] || '1:1';
  let bestGap = Number.POSITIVE_INFINITY;
  for (const ratio of candidates) {
    const pair = parseNumericPair(ratio, /:/);
    if (!pair) continue;
    const gap = Math.abs(Math.log(target / (pair[0] / pair[1])));
    if (gap < bestGap) {
      bestGap = gap;
      best = ratio;
    }
  }
  return best;
}

/**
 * 解析并规范化 Gemini 宽高比：
 * - 'auto' / 'default' / 'smart' 返回 undefined（由上游按参考图或默认 1:1 处理）
 * - 任意比例或像素尺寸都会映射到当前 Gemini 型号支持的合法宽高比集合中
 */
export function resolveGeminiAspectRatio(
  modelId?: string,
  sizeOrAspect?: string,
  aspectHint?: string,
): string | undefined {
  const candidates = geminiSupportedAspectRatios(modelId);
  const raw = (aspectHint || sizeOrAspect || '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === 'auto' || lower === 'default' || lower === 'smart') {
    return undefined;
  }
  const normalizedPixel = lower.replace(/\s+/g, '').replace(/[×*]/g, 'x');
  const exactFromPixel = PIXEL_TO_ASPECT.get(normalizedPixel);
  if (exactFromPixel) {
    return candidates.includes(exactFromPixel)
      ? exactFromPixel
      : closestRatio(
          (() => {
            const p = parseNumericPair(exactFromPixel, /:/);
            return p ? p[0] / p[1] : 1;
          })(),
          candidates,
        );
  }
  if (candidates.includes(raw)) return raw;
  const colonPair = parseNumericPair(raw.replace(/：/g, ':'), /:/);
  if (colonPair) {
    return closestRatio(colonPair[0] / colonPair[1], candidates);
  }
  const pixelPair = parseNumericPair(normalizedPixel, /x/i);
  if (pixelPair) {
    return closestRatio(pixelPair[0] / pixelPair[1], candidates);
  }
  return '3:4';
}

/**
 * 解析 Gemini image_size 档位（必须使用大写 K：1K / 2K / 4K 或 512px）。
 * 旧版 Gemini 2.5 Flash Image (nano-banana) 返回 undefined（不发送 image_size）。
 */
export function resolveGeminiImageSizeTier(
  modelId?: string,
  quality?: string,
  size?: string,
): GeminiImageSizeTier | undefined {
  if (!geminiSendsImageSize(modelId)) return undefined;
  if (isGeminiLiteImageModel(modelId)) return '1K';
  const id = (modelId || '').trim().toLowerCase();
  if (/(?:-4k|-hd)$/i.test(id)) return '4K';
  if (/-2k$/i.test(id)) return '2K';
  if (/-1k$/i.test(id)) return '1K';

  for (const token of [quality, size]) {
    const clean = (token || '').trim().toLowerCase();
    if (!clean) continue;
    if (clean === '512px' || clean === '512' || clean === '0.5k') {
      return geminiSupports512px(modelId) ? '512px' : '1K';
    }
    if (clean === 'low' || clean === '1k' || clean === '1024') return '1K';
    if (clean === 'medium' || clean === '2k' || clean === '2048') return '2K';
    if (clean === 'high' || clean === 'hd' || clean === '4k' || clean === '4096' || clean === 'xhigh' || clean === 'max') {
      return '4K';
    }
  }

  const normalizedPixel = (size || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x');
  const pixelPair = parseNumericPair(normalizedPixel, /x/i);
  if (pixelPair) {
    const maxEdge = Math.max(pixelPair[0], pixelPair[1]);
    if (maxEdge <= 688 && geminiSupports512px(modelId)) return '512px';
    if (maxEdge <= 1584) return '1K';
    if (maxEdge <= 3168) return '2K';
    return '4K';
  }

  return '2K';
}

/**
 * 根据比例、模型与画质档位返回官方文档对应的真实像素分辨率（如 3:4 + 4K => 3584x4800）
 */
export function resolveGeminiPixelSize(
  aspectOrSize?: string,
  modelId?: string,
  quality?: string,
): string {
  const ratio = resolveGeminiAspectRatio(modelId, aspectOrSize) || '1:1';
  if (isGeminiLegacy25ImageModel(modelId)) {
    return GEMINI_25_OFFICIAL_SIZES[ratio] || GEMINI_25_OFFICIAL_SIZES['1:1'];
  }
  const tier = resolveGeminiImageSizeTier(modelId, quality, aspectOrSize) || '2K';
  const row = GEMINI_3_OFFICIAL_SIZES[ratio] || GEMINI_3_OFFICIAL_SIZES['1:1'];
  switch (tier) {
    case '512px':
      return row[0];
    case '1K':
      return row[1];
    case '4K':
      return row[3];
    case '2K':
    default:
      return row[2];
  }
}
