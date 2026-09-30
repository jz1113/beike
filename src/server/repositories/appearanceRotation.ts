import { db } from './access';
import { audiencesCompatible, audiencesCompatibleWithInherited } from '@shared/domain/assets/appearanceAudience';
import type { Prisma } from '@prisma/client';

type Appearance = { id?: string; [key: string]: unknown };
export type InheritedAppearanceShot = { persona: string; outfit: string };

function compatibleAcrossShots(persona: Appearance, outfit: Appearance, shots: InheritedAppearanceShot[]): boolean {
  const bothLibraryAssets = Boolean(persona.id && outfit.id);
  const compatible = (person: Appearance, clothes: Appearance) => bothLibraryAssets
    ? audiencesCompatible(person, clothes)
    : audiencesCompatibleWithInherited(person, clothes);
  // Group summaries are derived from the first source image. A per-shot
  // observation takes precedence when the four mirrors differ.
  if (!shots.length) return compatible(persona, outfit);
  return shots.every(shot => compatible(
    persona.id ? persona : { description: shot.persona },
    outfit.id ? outfit : { reversePrompt: shot.outfit },
  ));
}

export const appearanceRotationRepository = {
  listPersonas: (where: Prisma.PersonaAssetWhereInput) =>
    db.personaAsset.findMany({ where, orderBy: { id: 'asc' } }),
  listOutfits: (where: Prisma.OutfitAssetWhereInput) =>
    db.outfitAsset.findMany({ where, orderBy: { id: 'asc' } }),
  reservePair: (personas: Appearance[], outfits: Appearance[], input: { rotatePersona: boolean; rotateOutfit: boolean; batchId?: string; inheritedShots?: InheritedAppearanceShot[] }) =>
    db.$transaction(async tx => {
      const events = await tx.promptAssetUsageEvent.findMany({ where: { eventType: 'appearance_rotation' }, orderBy: { createdAt: 'desc' } });
      const last = new Map<string, number>();
      for (const event of events) if (!last.has(event.assetId)) last.set(event.assetId, event.createdAt.getTime());
      const byUse = (a: Appearance, b: Appearance) => (last.get(a.id || '') || 0) - (last.get(b.id || '') || 0);
      if (input.rotatePersona) personas.sort(byUse);
      if (input.rotateOutfit) outfits.sort(byUse);
      for (const persona of personas) {
        const outfit = outfits.find(row => compatibleAcrossShots(persona, row, input.inheritedShots || []));
        if (!outfit) continue;
        const createdAt = new Date(Math.max(Date.now(), (events[0]?.createdAt.getTime() || 0) + 1));
        for (const asset of [input.rotatePersona ? persona : null, input.rotateOutfit ? outfit : null]) {
          if (asset?.id) await tx.promptAssetUsageEvent.create({ data: {
            assetId: asset.id, batchId: input.batchId || 'appearance-rotation', eventType: 'appearance_rotation', createdAt,
          } });
        }
        return { persona, outfit };
      }
      throw new Error('所选范围内没有与母本逐镜描述兼容的人物穿搭组合（男性不可配女装，年龄段须匹配）。请调整轮换范围、改选母本或指定兼容的人物与穿搭；未执行混搭。');
    }),
};
