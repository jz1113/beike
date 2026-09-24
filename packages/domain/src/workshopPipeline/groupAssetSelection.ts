import { inferProductCategoryAndAnatomy } from '../productCategory/infer';
import { parseGroupShotSkeleton } from './storyboardSlots';

export interface PromptGroupCandidate {
  id: string;
  title?: string | null;
  albumName?: string | null;
  contentSummary?: string | null;
  category?: string | null;
  productCategoryIds?: string | null;
  isUniversal?: boolean;
  sourceImageIndices?: string | null;
  shotPromptsJson?: string | null;
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isCompletePromptGroup(group: PromptGroupCandidate): boolean {
  const indices = parseArray(group.sourceImageIndices);
  const shots = parseGroupShotSkeleton(group.shotPromptsJson);
  return indices.length === 4
    && indices.every((value) => Number.isInteger(value) && Number(value) > 0)
    && new Set(indices).size === 4
    && shots.length === 4
    && new Set(shots.map((shot) => shot.shot_no)).size === 4
    && shots.every((shot) => Boolean(shot.prompt || shot.action || shot.scene));
}

/** Preserve database order as the quality preference; rotate equally matched groups across products. */
export function selectPromptGroupForProduct<T extends PromptGroupCandidate>(
  groups: T[],
  productTitle: string,
  productProps: Record<string, unknown> | null | undefined,
  productIndex: number,
): T | null {
  const productCategory = inferProductCategoryAndAnatomy(productTitle, productProps).primaryCategory;
  const eligible = groups.filter(isCompletePromptGroup);
  if (!eligible.length) return null;
  const scored = eligible.map((group) => {
    const categories = parseArray(group.productCategoryIds).map(String);
    const summaryCategory = inferProductCategoryAndAnatomy(group.contentSummary).primaryCategory;
    const inferred = summaryCategory !== 'all' ? summaryCategory : inferProductCategoryAndAnatomy(
      [group.title, group.albumName, group.category].filter(Boolean).join(' '),
    ).primaryCategory;
    const score = productCategory !== 'all' && categories.includes(productCategory) ? 100
      : productCategory !== 'all' && inferred === productCategory ? 80
      : group.isUniversal || categories.includes('all') ? 40
      : inferred === 'all' && categories.length === 0 ? 20
      : 0;
    return { group, score };
  });
  const bestScore = Math.max(...scored.map((entry) => entry.score));
  if (productCategory !== 'all' && bestScore === 0) return null;
  const best = scored.filter((entry) => entry.score === bestScore);
  return best[Math.abs(productIndex) % best.length].group;
}
