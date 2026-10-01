export interface FullPromptGroupVisibilityInput {
  provenance?: unknown;
  groupIndex?: unknown;
  sourceImageIndices?: unknown;
  shotPromptsJson?: unknown;
}

export const EMPTY_FULL_PROMPT_GROUP_STRUCTURES = ['', '[]', 'null'] as const;

function hasSavedGroupStructure(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'string'
    && !EMPTY_FULL_PROMPT_GROUP_STRUCTURES.some(empty => value === empty);
}

/** Saved group markers establish visibility; four-shot readiness is checked separately. */
export function isLegacyFullPromptSingle(asset: FullPromptGroupVisibilityInput): boolean {
  const provenance = typeof asset.provenance === 'string' ? asset.provenance : 'deconstructed';
  return provenance === 'deconstructed'
    && asset.groupIndex == null
    && !hasSavedGroupStructure(asset.sourceImageIndices)
    && !hasSavedGroupStructure(asset.shotPromptsJson);
}

export function isFullPromptGroupVisible(asset: FullPromptGroupVisibilityInput): boolean {
  return asset.provenance !== 'legacy_single' && !isLegacyFullPromptSingle(asset);
}
