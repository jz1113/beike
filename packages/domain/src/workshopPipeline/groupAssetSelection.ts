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

/** Rank all category-compatible complete groups; use generic groups only as fallback. */
export function eligiblePromptGroups<T extends PromptGroupCandidate>(
  groups: T[],
  productTitle: string,
  productProps: Record<string, unknown> | null | undefined,
): T[] {
  const productCategory = inferProductCategoryAndAnatomy(productTitle, productProps).primaryCategory;
  const eligible = groups.filter(isCompletePromptGroup);
  if (!eligible.length) return [];
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
  const matching = scored.filter(entry => entry.score >= 80);
  const fallback = scored.filter(entry => entry.score > 0);
  return (matching.length ? matching : fallback).sort((a,b) => b.score - a.score || a.group.id.localeCompare(b.group.id)).map(entry => entry.group);
}

export function selectPromptGroupForProduct<T extends PromptGroupCandidate>(groups: T[], productTitle: string, productProps: Record<string, unknown> | null | undefined, productIndex: number): T | null {
  const eligible = eligiblePromptGroups(groups, productTitle, productProps);
  return eligible.length ? eligible[Math.abs(productIndex) % eligible.length] : null;
}
