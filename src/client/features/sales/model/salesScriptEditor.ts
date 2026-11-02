import type { SalesScriptBeat, SalesScriptDomain, SalesSourceExclusion } from '@shared/domain/sales';

export interface BeatAddress { shot: number; beat: number }

const tenth = (value: number) => Math.round(Math.max(0, value) * 10) / 10;

function withShots(script: SalesScriptDomain, shots: SalesScriptDomain['shots']): SalesScriptDomain {
  return { ...script, shots: shots.filter((shot) => shot.beats.length > 0) };
}

/** Keep shot boundaries aligned with the beats a reviewer edits. */
function syncShotRange(shot: SalesScriptDomain['shots'][number]) {
  return { ...shot, start: Math.min(shot.start, shot.beats[0].start), end: Math.max(shot.end, shot.beats[shot.beats.length - 1].end) };
}

export function updateBeat(script: SalesScriptDomain, at: BeatAddress, patch: Partial<SalesScriptBeat>): SalesScriptDomain {
  return withShots(script, script.shots.map((shot, s) => s !== at.shot ? shot : syncShotRange({
    ...shot,
    beats: shot.beats.map((beat, b) => {
      if (b !== at.beat) return beat;
      const next = { ...beat, ...patch, voice: { ...beat.voice, ...patch.voice } };
      if (patch.start !== undefined) next.start = tenth(patch.start);
      if (patch.end !== undefined) next.end = tenth(patch.end);
      if (patch.actionTemplate !== undefined) next.action = patch.actionTemplate;
      return next;
    }),
  })));
}

export function updateShotSummary(script: SalesScriptDomain, shotIndex: number, summary: string): SalesScriptDomain {
  return { ...script, shots: script.shots.map((shot, s) => s === shotIndex ? { ...shot, summary } : shot) };
}

export function splitBeat(script: SalesScriptDomain, at: BeatAddress): SalesScriptDomain {
  const beat = script.shots[at.shot]?.beats[at.beat];
  if (!beat || beat.end - beat.start < 0.4) return script;
  const middle = tenth((beat.start + beat.end) / 2);
  return withShots(script, script.shots.map((shot, s) => s !== at.shot ? shot : {
    ...shot,
    beats: shot.beats.flatMap((item, b) => b !== at.beat ? [item] : [
      { ...item, end: middle },
      { ...item, start: middle, estimated: true, previewFrameUrl: '', voice: { ...item.voice, text: '' }, subtitle: '' },
    ]),
  }));
}

/** Merge with the next beat inside the same real shot; cuts are never silently removed. */
export function mergeBeatWithNext(script: SalesScriptDomain, at: BeatAddress): SalesScriptDomain {
  const shot = script.shots[at.shot];
  const current = shot?.beats[at.beat];
  const next = shot?.beats[at.beat + 1];
  if (!current || !next) return script;
  const join = (a: string, b: string) => [a, b].map((part) => part.trim()).filter(Boolean).join('；');
  const merged: SalesScriptBeat = {
    ...current, end: next.end, estimated: current.estimated || next.estimated,
    actionTemplate: join(current.actionTemplate, next.actionTemplate), action: join(current.actionTemplate, next.actionTemplate),
    referenceActionRaw: join(current.referenceActionRaw, next.referenceActionRaw), camera: join(current.camera, next.camera),
    expression: join(current.expression, next.expression), subtitle: join(current.subtitle, next.subtitle), shows: join(current.shows, next.shows),
    voice: { ...current.voice, text: join(current.voice.text, next.voice.text), linePattern: join(current.voice.linePattern, next.voice.linePattern) },
    inferred: [...current.inferred, ...next.inferred],
  };
  return withShots(script, script.shots.map((item, s) => s !== at.shot ? item : {
    ...item, beats: [...item.beats.slice(0, at.beat), merged, ...item.beats.slice(at.beat + 2)],
  }));
}

export function deleteBeat(script: SalesScriptDomain, at: BeatAddress): SalesScriptDomain {
  const total = script.shots.reduce((sum, shot) => sum + shot.beats.length, 0);
  if (total <= 1) return script;
  return withShots(script, script.shots.map((shot, s) => s !== at.shot ? shot : { ...shot, beats: shot.beats.filter((_, b) => b !== at.beat) }));
}

export function addExclusion(script: SalesScriptDomain, item: SalesSourceExclusion): SalesScriptDomain {
  const term = item.term.trim();
  if (!term || script.sourceExclusions.some((existing) => existing.term === term)) return script;
  return { ...script, sourceExclusions: [...script.sourceExclusions, { ...item, term }] };
}

export function removeExclusion(script: SalesScriptDomain, term: string): SalesScriptDomain {
  return { ...script, sourceExclusions: script.sourceExclusions.filter((item) => item.term !== term) };
}

/** Replace leaked source-only terms with a neutral product placeholder in reusable fields. */
export function replaceExclusionLeak(script: SalesScriptDomain, term: string, replacement = '{{商品}}'): SalesScriptDomain {
  if (!term) return script;
  return {
    ...script,
    visualSpec: { ...script.visualSpec, styleSummary: script.visualSpec.styleSummary.split(term).join(replacement) },
    shots: script.shots.map((shot) => ({ ...shot, beats: shot.beats.map((beat) => {
      const actionTemplate = beat.actionTemplate.split(term).join(replacement);
      return { ...beat, actionTemplate, action: actionTemplate };
    }) })),
  };
}

export function scriptBeatCount(script: SalesScriptDomain) {
  return script.shots.reduce((sum, shot) => sum + shot.beats.length, 0);
}

export function formatScriptSeconds(value: number) {
  return `${tenth(value).toFixed(1)}s`;
}
