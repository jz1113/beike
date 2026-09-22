export const COVERAGE_SHOT_SCALES = ['macro_closeup', 'half_body', 'full_body'] as const;
export type CoverageShotScale = (typeof COVERAGE_SHOT_SCALES)[number];

export const COVERAGE_ACTION_SLOTS = ['wear', 'hold', 'detail', 'lifestyle'] as const;
export type CoverageActionSlot = (typeof COVERAGE_ACTION_SLOTS)[number];

export interface CoverageSlot {
  categoryId: string;
  shotScale: CoverageShotScale;
  actionSlot: CoverageActionSlot;
  count: number;
  target: number;
}

export interface CoverageGap extends CoverageSlot {
  gap: number;
}

export function buildCoverageMatrix(input: {
  categoryIds: string[];
  assets: Array<{ categoryIds: string[]; shotScale?: string; actionSlot?: string }>;
  target?: number;
}): CoverageSlot[] {
  const target = input.target ?? 3;
  return input.categoryIds.flatMap((categoryId) =>
    COVERAGE_SHOT_SCALES.flatMap((shotScale) =>
      COVERAGE_ACTION_SLOTS.map((actionSlot) => {
        const count = input.assets.filter((asset) =>
          asset.categoryIds.includes(categoryId)
          && normalizeScale(asset.shotScale) === shotScale
          && normalizeSlot(asset.actionSlot) === actionSlot
        ).length;
        return { categoryId, shotScale, actionSlot, count, target };
      }),
    ),
  );
}

export function coverageGaps(slots: CoverageSlot[]): CoverageGap[] {
  return slots
    .map((slot) => ({ ...slot, gap: Math.max(0, slot.target - slot.count) }))
    .filter((slot) => slot.gap > 0)
    .sort((a, b) => b.gap - a.gap);
}

function normalizeScale(value?: string): CoverageShotScale {
  const lower = String(value || '').toLowerCase();
  if (lower.includes('full')) return 'full_body';
  if (lower.includes('half')) return 'half_body';
  return 'macro_closeup';
}

function normalizeSlot(value?: string): CoverageActionSlot {
  const lower = String(value || '').toLowerCase();
  if (lower.includes('hold') || lower.includes('握')) return 'hold';
  if (lower.includes('life') || lower.includes('氛围')) return 'lifestyle';
  if (lower.includes('wear') || lower.includes('佩戴')) return 'wear';
  return 'detail';
}
