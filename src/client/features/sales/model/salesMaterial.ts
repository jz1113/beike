import type { SalesActionCandidate, SalesMaterialCatalog, SalesScriptDomain } from '@shared/domain/sales';
import { actionMedia } from './salesActionMedia';
import type { SalesProductionPlanState } from './salesProductionDraft';
import { hasCustomSalesPersona } from './salesPersonaBinding';

/** 将分镜已绑定的动作/姿态资产映射为提示词组装所需的引用表 */
export function buildSalesBeatActionReferences(
  beatActionIds: Record<number, string>,
  actions: readonly SalesActionCandidate[],
): Record<number, { url: string; mediaType: 'image' | 'video'; label: string }> {
  const refs: Record<number, { url: string; mediaType: 'image' | 'video'; label: string }> = {};
  for (const [beatKey, actionId] of Object.entries(beatActionIds)) {
    const beatIdx = Number(beatKey);
    if (!Number.isInteger(beatIdx) || beatIdx < 0) continue;
    const found = actions.find((item) => item.id === actionId);
    if (!found) continue;
    const media = actionMedia(found);
    if (!media.url) continue;
    refs[beatIdx] = {
      url: media.url,
      mediaType: media.video ? 'video' : 'image',
      label: `片段 ${beatIdx + 1} 动作参考（${found.title || '姿态参考'}）`,
    };
  }
  return refs;
}

/** Apply a reusable action to one beat while preserving edited dialogue and other beats. */
export function applyMaterialAction(
  script: SalesScriptDomain,
  plan: SalesProductionPlanState,
  asset: SalesActionCandidate,
  beatIndex: number,
): Partial<SalesProductionPlanState> {
  const beats = script.shots.flatMap((shot) => shot.beats);
  if (!Number.isInteger(beatIndex) || !beats[beatIndex] || (!asset.action.trim() && !asset.mediaUrl && !asset.coverUrl)) return {};
  const edits = new Map(plan.adaptedBeats.map((beat) => [beat.index, beat]));
  return {
    beatActionIds: { ...plan.beatActionIds, [beatIndex]: asset.id },
    adaptedBeats: beats.map((beat, index) => {
      const current = edits.get(index) || {
        index, subject: beat.subject, action: beat.actionTemplate || beat.action,
        spokenLine: '', subtitle: '',
      };
      return index === beatIndex && asset.action.trim() ? { ...current, action: asset.action } : current;
    }),
    customPrompt: '',
  };
}

/** Preserve chosen identities and scenes so a refresh cannot silently replace them. */
export function reconcileSalesMaterialBindings(
  plan: SalesProductionPlanState,
  catalog: SalesMaterialCatalog,
): SalesProductionPlanState {
  const personaId = hasCustomSalesPersona(plan) ? '' : plan.personaId;
  const sceneId = plan.customSceneImageUrl.trim() ? '' : plan.sceneId;
  const voiceId = catalog.voices.some((item) => item.id === plan.voiceId) ? plan.voiceId : '';
  const bgmId = catalog.bgms.some((item) => item.id === plan.bgmId) ? plan.bgmId : '';
  const beatActionIds = Object.fromEntries(Object.entries(plan.beatActionIds).filter(([, id]) => catalog.actions.some((item) => item.id === id)));
  if (personaId === plan.personaId && sceneId === plan.sceneId && voiceId === plan.voiceId && bgmId === plan.bgmId && Object.keys(beatActionIds).length === Object.keys(plan.beatActionIds).length) return plan;
  return { ...plan, personaId, sceneId, voiceId, bgmId, beatActionIds, customPrompt: '' };
}
