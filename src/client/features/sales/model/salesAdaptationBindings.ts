import type { SalesSceneCandidate, SalesScriptDomain } from '@shared/domain/sales';
import type { SalesProductionPlanState } from './salesProductionDraft';

export function salesAdaptationSceneKey(plan: SalesProductionPlanState, scene?: SalesSceneCandidate | null): string {
  return JSON.stringify(plan.customSceneImageUrl.trim()
    ? ['custom', plan.customSceneImageUrl.trim()]
    : ['library', plan.sceneId, scene?.id || '', scene?.title || '', scene?.description || '', scene?.lighting || '', scene?.coverUrl || '']);
}

/** A bounded content signature for freshness checks, never an authorization token. */
export function salesAdaptationScriptKey(script?: SalesScriptDomain): string {
  if (!script) return '';
  const content = JSON.stringify([
    script.title, script.durationSec, script.format, script.voiceMode, script.visualSpec,
    script.assetSlots.persona, script.assetSlots.scene, script.sourceExclusions,
    script.shots.map((shot) => [shot.start, shot.end, shot.beats.map((beat) => [
      beat.start, beat.end, beat.purpose, beat.shotSize, beat.camera, beat.subject,
      beat.action, beat.actionTemplate, beat.expression, beat.scene, beat.transition,
      beat.requiredView, beat.voice, beat.subtitle,
    ])]),
  ]);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < content.length; index += 1) {
    first = Math.imul(first ^ content.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ content.charCodeAt(index), 0x5bd1e995);
  }
  return `script-v1:${content.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}
