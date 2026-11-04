import type { SalesBeatVoiceMode, SalesScriptDomain } from '@shared/domain/sales';

export interface SalesSpokenCopyContext {
  voiceMode: SalesBeatVoiceMode;
  durationSec: number;
}

/** Track timing inputs without treating later manual wording edits as a new model run. */
export function salesSpokenCopySourceKey(script: SalesScriptDomain, voiceMode: SalesBeatVoiceMode, durationSec: number): string {
  return JSON.stringify([
    'spoken-copy-v1', voiceMode, durationSec, script.durationSec,
    script.assetSlots.audio.targetCps > 0 ? script.assetSlots.audio.targetCps : 3.8,
    script.shots.flatMap((shot) => shot.beats.map((beat) => [beat.start, beat.end])),
  ]);
}

/** Extra output padding does not change the retained dialogue or its speaking windows. */
export function salesSpokenCopyTimingMatches(key: string, script: SalesScriptDomain, voiceMode: SalesBeatVoiceMode, durationSec: number): boolean {
  try {
    const previous: unknown = JSON.parse(key);
    const current: unknown[] = JSON.parse(salesSpokenCopySourceKey(script, voiceMode, durationSec));
    return Array.isArray(previous) && previous.length === current.length && durationSec >= script.durationSec
      && previous.every((value, index) => index === 2 || JSON.stringify(value) === JSON.stringify(current[index]));
  } catch { return false; }
}
