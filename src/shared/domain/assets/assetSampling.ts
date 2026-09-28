/**
 * 提示词资产库批次采样：加权随机、频次惩罚、批次互斥。
 */

export interface SampleableAsset {
  id: string;
  isFavorite?: boolean;
  usageCount?: number;
  shotType?: string | null;
  title?: string | null;
  name?: string | null;
}

export const DEFAULT_USAGE_THRESHOLD = 3;

/** 基于 DB id 生成稳定展示编号，与列表序号解耦 */
export function stableAssetCode(prefix: 'S' | 'O' | 'A' | 'P' | 'R', id: string): string {
  if (!id) return `${prefix}-0000`;
  const compact = id.replace(/[^a-zA-Z0-9]/g, '');
  const short = (compact.slice(-4) || compact.slice(0, 4) || '0000').toLowerCase();
  return `${prefix}-${short}`;
}

export function computeSamplingSeed(productIndex: number, productTitle: string): number {
  const titleHash = Array.from(productTitle || '').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (productIndex * 37 + titleHash * 13) % 10007;
}

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.abs((seed * (i + 1) + i * 17)) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function computeAssetWeight(
  asset: SampleableAsset,
  usageThreshold: number = DEFAULT_USAGE_THRESHOLD,
): number {
  let weight = 10;
  if (asset.isFavorite) weight += 20;
  const usage = asset.usageCount || 0;
  if (usage >= usageThreshold && !asset.isFavorite) {
    weight = Math.max(1, weight - usage * 2);
  } else {
    weight += Math.max(0, 5 - usage);
  }
  return weight;
}

export function pickWeightedRandom<T extends SampleableAsset>(
  candidates: T[],
  seed: number,
  excludeIds: Set<string> = new Set(),
  count = 1,
  usageThreshold: number = DEFAULT_USAGE_THRESHOLD,
): { picked: T[]; reason: string } {
  if (candidates.length === 0) {
    return { picked: [], reason: 'empty_pool' };
  }

  let pool = candidates.filter((c) => c.id && !excludeIds.has(String(c.id)));
  let reason = 'weighted_random';
  if (pool.length < count) {
    pool = [...candidates];
    reason = 'weighted_random_relaxed_exclusion';
  }

  const picked: T[] = [];
  let rollingSeed = seed;
  const remaining = seededShuffle(pool, seed);

  while (picked.length < count && remaining.length > 0) {
    const weights = remaining.map((a) => computeAssetWeight(a, usageThreshold));
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    let r = rollingSeed % totalWeight;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) {
        idx = i;
        break;
      }
    }
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
    rollingSeed = (rollingSeed * 31 + 7) % 10007;
  }

  return { picked, reason };
}

const ACTION_SHOT_LAYERS = ['macro_detail', 'profile_45', 'interaction', 'half_body', 'lifestyle'] as const;

export function classifyActionShotType(shotType?: string, title?: string): string {
  const s = `${shotType || ''} ${title || ''}`.toLowerCase();
  if (/macro|微距|特写|detail/.test(s)) return 'macro_detail';
  if (/profile|侧颜|45/.test(s)) return 'profile_45';
  if (/interact|互动|手势|托|捧/.test(s)) return 'interaction';
  if (/half|半身|bust/.test(s)) return 'half_body';
  return 'lifestyle';
}

/** 分层抽取 4 个互斥动作：微距 + 侧颜 + 互动 + 氛围 */
export function pickActionSet<T extends SampleableAsset>(
  candidates: T[],
  seed: number,
  excludeIds: Set<string>,
  shotCount = 4,
): T[] {
  if (candidates.length === 0) return [];

  let pool = candidates.filter((c) => c.id && !excludeIds.has(String(c.id)));
  if (pool.length < shotCount) pool = [...candidates];

  const shuffled = seededShuffle(pool, seed);
  const picked: T[] = [];
  const usedIds = new Set<string>();

  for (const layer of ACTION_SHOT_LAYERS) {
    if (picked.length >= shotCount) break;
    const match = shuffled.find(
      (c) => !usedIds.has(String(c.id)) && classifyActionShotType(c.shotType || undefined, c.title || c.name || undefined) === layer,
    );
    if (match) {
      picked.push(match);
      usedIds.add(String(match.id));
    }
  }

  for (const c of shuffled) {
    if (picked.length >= shotCount) break;
    if (!usedIds.has(String(c.id))) {
      picked.push(c);
      usedIds.add(String(c.id));
    }
  }

  return picked.slice(0, shotCount);
}

export const SHOT_LIGHTING_VARIATIONS = [
  '清晨斜射自然晨光（5500K 色温，空气清新通透，真实物理轮廓阴影）',
  '午后温暖侧射阳光（微暖调，自然斑驳树影与窗棂透光微光斑）',
  '黄昏黄金时刻柔和暖金天光（Golden Hour，温暖恬静，柔和环境漫反射）',
  '明亮室内大面积自然天光漫射（极简纯粹，无明显硬阴影，温润高显色）',
] as const;

export function getShotLightingVariation(productIndex: number, shotIndex: number): string {
  return SHOT_LIGHTING_VARIATIONS[(productIndex + shotIndex) % SHOT_LIGHTING_VARIATIONS.length];
}
