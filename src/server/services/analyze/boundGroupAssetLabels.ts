import { resolveBoundGroupAppearance, type FilledShotSlot } from '@shared/domain/workshop/workshopPipeline';
import { formatAssetWithCode } from './promptAssemblerFormat';

/** Labels describe the resolved slot, not a synthetic shared "图组原场景" asset. */
export function boundGroupAssetLabels(slot: FilledShotSlot) {
  const { persona, outfit } = resolveBoundGroupAppearance(slot);
  return {
    applied_scene: slot.sceneAsset?.id
      ? formatAssetWithCode(undefined, [slot.sceneAsset], 'S')
      : slot.scene ? `母本场景 · ${slot.scene}` : '沿用母本逐镜场景',
    applied_persona: !persona ? undefined : slot.persona?.id
      ? formatAssetWithCode(undefined, [slot.persona], 'P') : `母本人物 · ${persona}`,
    applied_outfit: !outfit ? undefined : slot.outfit?.id
      ? formatAssetWithCode(undefined, [slot.outfit], 'O') : `母本穿搭 · ${outfit}`,
  };
}
