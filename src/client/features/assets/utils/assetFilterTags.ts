import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import { humanizeShotType, normalizeTagToChinese, type AssetSubTab } from './assetPromptConstants';

export interface FilterableAsset extends AssetLibrarySlim {
  posture?: string | null;
  hairStyle?: string | null;
  hairColor?: string | null;
  vibe?: string | null;
  style?: string | null;
  top?: string | null;
  bottom?: string | null;
  colorPalette?: string | null;
  dimensions?: string | null;
  reversePrompt?: string | null;
  reversePromptZh?: string | null;
  lifecycleStatus?: string;
  registry?: { status?: string } | null;
}

export function buildAssetTagList(items: FilterableAsset[], activeSubTab: AssetSubTab): { tag: string; count: number }[] {
    const baseItems = items;
    if (!baseItems || baseItems.length === 0) return [];

    const tagCountMap = new Map<string, number>();

    const extractTagsSafe = (raw: unknown): string[] => {
      if (!raw) return [];
      if (Array.isArray(raw)) {
        return raw.map(String).map((s) => s.replace(/["'[\]{}]/g, '').trim()).filter(Boolean);
      }
      if (typeof raw === 'string') {
        const str = raw.trim();
        if (str.startsWith('[') && str.endsWith(']')) {
          try {
            const parsed = JSON.parse(str);
            if (Array.isArray(parsed)) {
              return parsed.map(String).map((s) => s.replace(/["'[\]{}]/g, '').trim()).filter(Boolean);
            }
          } catch {
            /* ignore */
          }
        }
        return str
          .split(/[,，、/| ;]+/)
          .map((s) => s.replace(/["'[\]{}]/g, '').trim())
          .filter(Boolean);
      }
      return [];
    };

    for (const item of baseItems) {
      const candidates: string[] = [];

      if (activeSubTab === 'action') {
        // 动作库已在第二行提供结构化的品类与景别筛选，避免注入重复的“服饰/首饰/特写/半身”标签
        if (item.posture && item.posture !== 'general') candidates.push(item.posture);
      } else {
        candidates.push(...extractTagsSafe(item.tags));
        candidates.push(...extractTagsSafe(item.suitableAnatomy));
        if (item.category && item.category !== 'general') candidates.push(item.category);
        if (item.spatialType) candidates.push(item.spatialType);
        if (item.hairStyle && item.hairStyle.length <= 8) candidates.push(item.hairStyle);
        if (item.hairColor && item.hairColor.length <= 8) candidates.push(item.hairColor);
        if (item.vibe && item.vibe.length <= 8) candidates.push(item.vibe);
        if (item.style && item.style.length <= 8) candidates.push(item.style);
        if (item.shotType) {
          const st = humanizeShotType(item.shotType);
          if (st) candidates.push(st);
        }
      }

      const seenInItem = new Set<string>();
      for (const raw of candidates) {
        const clean = normalizeTagToChinese(raw.trim());
        if (clean && clean.length >= 2 && clean.length <= 8 && !seenInItem.has(clean)) {
          seenInItem.add(clean);
          tagCountMap.set(clean, (tagCountMap.get(clean) || 0) + 1);
        }
      }
    }

    return Array.from(tagCountMap.entries())
      .filter(([, count]) => count > 0)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
}
