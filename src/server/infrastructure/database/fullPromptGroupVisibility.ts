import type { Prisma } from '@prisma/client';
import { EMPTY_FULL_PROMPT_GROUP_STRUCTURES } from '@shared/domain/assets/fullPromptGroupVisibility';

/** Retain historical rows while excluding ungrouped reverse-engineering records from the library. */
export function fullPromptGroupVisibilityWhere(): Prisma.FullPromptAssetWhereInput {
  const nonEmptyStructure = { not: null, notIn: [...EMPTY_FULL_PROMPT_GROUP_STRUCTURES] };
  return {
    AND: [
      { provenance: { not: 'legacy_single' } },
      {
        OR: [
          { groupIndex: { not: null } },
          { provenance: { not: 'deconstructed' } },
          { sourceImageIndices: nonEmptyStructure },
          { shotPromptsJson: nonEmptyStructure },
        ],
      },
    ],
  };
}

// Match the ORM condition for infrastructure queries which cannot use Prisma where inputs.
const emptyStructuresSql = EMPTY_FULL_PROMPT_GROUP_STRUCTURES.map(value => `'${value}'`).join(', ');
export const FULL_PROMPT_GROUP_VISIBILITY_SQL = `(
  "provenance" <> 'legacy_single' AND (
    "groupIndex" IS NOT NULL OR "provenance" <> 'deconstructed'
    OR ("sourceImageIndices" IS NOT NULL AND "sourceImageIndices" NOT IN (${emptyStructuresSql}))
    OR ("shotPromptsJson" IS NOT NULL AND "shotPromptsJson" NOT IN (${emptyStructuresSql}))
  )
)`;
