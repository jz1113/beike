import { matchesAppearanceSelection, type AppearanceSelection } from '@shared/domain/assets/appearanceSelection';
import { appearanceRotationRepository, type InheritedAppearanceShot } from '../../repositories/appearanceRotation';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { isWorkshopAssetEligible } from '@shared/domain/workshop/workshopPipeline';
import { publishedWhere } from '../promptAsset/recall';

type Appearance = { id?: string; [key: string]: unknown };
const pendingByWorkspace = new Map<string, Promise<unknown>>();

/** Reserve a compatible pair before model work; one workspace queue handles concurrent products. */
export async function rotateAppearance(input: {
  rotatePersona: boolean; rotateOutfit: boolean;
  personaSelection?: AppearanceSelection; outfitSelection?: AppearanceSelection;
  persona: Appearance; outfit: Appearance; batchId?: string;
  inheritedShots?: InheritedAppearanceShot[];
}) {
  const key = requireWorkspaceId();
  const pending = (pendingByWorkspace.get(key) || Promise.resolve()).catch(() => undefined).then(async () => {
    const personas: Appearance[] = input.rotatePersona
      ? (await appearanceRotationRepository.listPersonas(await publishedWhere('persona'))).filter(row => isWorkshopAssetEligible(row, 'persona') && (!input.personaSelection || matchesAppearanceSelection(row, input.personaSelection)))
      : [input.persona];
    const outfits: Appearance[] = input.rotateOutfit
      ? (await appearanceRotationRepository.listOutfits(await publishedWhere('outfit'))).filter(row => isWorkshopAssetEligible(row, 'outfit') && (!input.outfitSelection || matchesAppearanceSelection(row, input.outfitSelection, true)))
      : [input.outfit];
    return appearanceRotationRepository.reservePair(personas, outfits, input);
  });
  pendingByWorkspace.set(key, pending);
  try { return await pending; }
  finally { if (pendingByWorkspace.get(key) === pending) pendingByWorkspace.delete(key); }
}
