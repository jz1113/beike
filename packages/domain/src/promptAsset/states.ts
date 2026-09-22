export const PROMPT_ASSET_STATUSES = [
  'draft',
  'pending_review',
  'published',
  'needs_fix',
  'disabled',
  'archived',
] as const;
export type PromptAssetStatus = (typeof PROMPT_ASSET_STATUSES)[number];

export const PROMPT_ASSET_TYPES = [
  'scene',
  'outfit',
  'action',
  'persona',
  'full_prompt',
] as const;
export type PromptAssetType = (typeof PROMPT_ASSET_TYPES)[number];

export const USAGE_EVENT_TYPES = [
  'recommended',
  'locked',
  'analysis_used',
  'generation_submitted',
  'generation_succeeded',
  'generation_failed',
  'output_accepted',
  'retry_requested',
  'output_rejected',
  'output_exported',
] as const;
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export const OFFICIAL_PROVENANCES = ['official', 'seed', 'official_catalog', 'official_seed'] as const;

export function isOfficialProvenance(provenance: string | null | undefined): boolean {
  const value = String(provenance || '').toLowerCase();
  return OFFICIAL_PROVENANCES.some((item) => value === item || value.includes('official') || value.includes('seed'));
}

export function initialRegistryStatus(provenance: string | null | undefined, grandfather = false): PromptAssetStatus {
  if (isOfficialProvenance(provenance)) return 'published';
  if (grandfather) return 'published';
  return 'pending_review';
}

export function canRecallStatus(status: string | null | undefined): boolean {
  return status === 'published';
}

const TRANSITIONS: Record<PromptAssetStatus, PromptAssetStatus[]> = {
  draft: ['pending_review', 'archived'],
  pending_review: ['published', 'needs_fix', 'draft', 'archived'],
  published: ['needs_fix', 'disabled', 'archived'],
  needs_fix: ['pending_review', 'published', 'disabled', 'archived'],
  disabled: ['published', 'archived'],
  archived: [],
};

export function canTransition(from: PromptAssetStatus, to: PromptAssetStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
