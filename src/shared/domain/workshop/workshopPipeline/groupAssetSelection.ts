import { parseGroupShotSkeleton } from './storyboardSlots';
import { promptGroupCategoryFit } from './groupCategoryFit';

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
  hasHuman?: boolean | null;
}

export type PromptGroupAppearance = 'human' | 'product' | 'unknown';
export type PromptGroupAppearanceFilter = Exclude<PromptGroupAppearance, 'unknown'>;

/** The saved selection is either a real group ID or one of three auto modes. */
export function isAutoPromptGroupSelection(selection?: string | null): boolean {
  return !selection || selection === 'auto' || selection === 'auto:human' || selection === 'auto:product';
}

export function promptGroupAppearanceFilter(selection?: string | null): PromptGroupAppearanceFilter | undefined {
  if (selection === 'auto:human') return 'human';
  if (selection === 'auto:product') return 'product';
  return undefined;
}

/** A group with any portrait shot uses the appearance slots; hand-only shots do not count. */
export function promptGroupAppearance(group: PromptGroupCandidate): PromptGroupAppearance {
  const shots = parseGroupShotSkeleton(group.shotPromptsJson);
  const portrait = shots.some((shot) => shot.shot_type !== 'hand_held_only'
    && shot.shot_type !== 'pure_product' && shot.has_human === true);
  if (portrait) return 'human';
  const allNonPortrait = shots.length > 0 && shots.every((shot) => shot.shot_type === 'hand_held_only'
    || shot.shot_type === 'pure_product' || shot.has_human === false);
  if (allNonPortrait) return 'product';
  if (group.hasHuman === true) return 'human';
  if (group.hasHuman === false) return 'product';
  return 'unknown';
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
  appearance?: PromptGroupAppearanceFilter,
): T[] {
  const eligible = groups.filter(group => isCompletePromptGroup(group)
    && (!appearance || promptGroupAppearance(group) === appearance));
  if (!eligible.length) return [];
  const scored = eligible.map(group => ({ group, score: promptGroupCategoryFit(group, productTitle, productProps) }));
  const matching = scored.filter(entry => entry.score >= 80);
  const fallback = scored.filter(entry => entry.score > 0);
  return (matching.length ? matching : fallback).sort((a,b) => b.score - a.score || a.group.id.localeCompare(b.group.id)).map(entry => entry.group);
}

export function selectPromptGroupForProduct<T extends PromptGroupCandidate>(groups: T[], productTitle: string, productProps: Record<string, unknown> | null | undefined, productIndex: number): T | null {
  const eligible = eligiblePromptGroups(groups, productTitle, productProps);
  return eligible.length ? eligible[Math.abs(productIndex) % eligible.length] : null;
}
