import { parseGroupShotSkeleton } from '@shared/domain/workshop/workshopPipeline';
import { findMotherReplacement, findReplaceableMother } from '@server/repositories/motherGroupReplacement';

export async function getMotherReplacementState(motherId: string) {
  const mother = await findReplaceableMother(motherId);
  if (!mother) return null;
  const replacement = await findMotherReplacement(motherId);
  let sourceImages: string[] = [];
  try {
    const parsed = JSON.parse(mother.sourceImages || '[]');
    const indices = JSON.parse(mother.sourceImageIndices || '[]');
    if (Array.isArray(parsed) && Array.isArray(indices)) {
      sourceImages = indices.slice(0, 4).map(index => parsed[Number(index) - 1]).filter((url): url is string => typeof url === 'string');
    }
  } catch { /* Old imported records may not have a complete image array. */ }
  return {
    replaced: Boolean(replacement),
    replaceable: mother.groupIndex != null && parseGroupShotSkeleton(mother.shotPromptsJson).length === 4
      && mother.provenance !== 'workshop_generated' && !replacement,
    replacedAt: replacement?.createdAt || null,
    sourceImages,
  };
}
