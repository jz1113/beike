import { sourcePromptSection } from '@shared/domain/workshop/workshopPipeline';
import type { ShotPrompt } from '@shared/domain/prompts/vision';

type AssetShot = Pick<ShotPrompt, 'prompt' | 'applied_scene' | 'applied_outfit' | 'applied_persona'>
  & Partial<Pick<ShotPrompt, 'scene' | 'assembly_source' | 'has_human' | 'shot_type'>>;

/** Only display real supplied asset codes; a list position is not an asset identity. */
export function formatAssetBadgeText(text: string | undefined): string {
  const trimmed = (text || '').trim();
  const match = trimmed.match(/^\[?#([PSOAR]-[\w-]+)\]?\s*(.*)$/i);
  return match ? `[#${match[1].toUpperCase()}] ${match[2]}`.trim() : trimmed;
}

function inheritedLabel(value: string | undefined, kind: '场景' | '人物' | '穿搭', detail: string): string {
  const raw = (value || '').replace(/^\[?#[PSOA]-[\w-]+\]?\s*/i, '');
  // Old saved batches used the same synthetic S-01/P-01/O-01 for every mother group.
  if (!raw || raw === `图组原${kind}`) return detail ? `母本${kind} · ${detail}` : `沿用母本${kind}`;
  return formatAssetBadgeText(value);
}

export function getShotAssetLabels(shot: AssetShot, productPersona?: string) {
  const group = shot.assembly_source === 'group_skeleton';
  const portrait = shot.has_human !== false && shot.shot_type !== 'hand_held_only' && shot.shot_type !== 'pure_product';
  const scene = sourcePromptSection(shot.prompt || '', '场景结构') || shot.scene || '';
  return {
    scene: group ? inheritedLabel(shot.applied_scene, '场景', scene) : formatAssetBadgeText(shot.applied_scene),
    outfit: !portrait ? '' : group
      ? inheritedLabel(shot.applied_outfit, '穿搭', sourcePromptSection(shot.prompt || '', '穿搭'))
      : formatAssetBadgeText(shot.applied_outfit),
    persona: !portrait ? '' : group
      ? inheritedLabel(shot.applied_persona, '人物', sourcePromptSection(shot.prompt || '', '人物'))
      : formatAssetBadgeText(shot.applied_persona || productPersona),
  };
}

export function getSharedAssetLabels(shots: AssetShot[], productPersona?: string) {
  const labels = shots.map(shot => getShotAssetLabels(shot, productPersona));
  const common = (key: 'scene' | 'outfit' | 'persona') => {
    const value = labels[0]?.[key];
    if (labels.length < 2 || !value || !labels.every(label => label[key] === value)) return undefined;
    // A shared label alone does not establish a shared physical scene (legacy batches).
    if (key === 'scene') {
      const scenes = shots.map(shot => sourcePromptSection(shot.prompt || '', '场景结构') || shot.scene || '');
      if (!scenes.every(scene => scene === scenes[0])) return undefined;
    }
    return value;
  };
  return { scene: common('scene'), outfit: common('outfit'), persona: common('persona') };
}
