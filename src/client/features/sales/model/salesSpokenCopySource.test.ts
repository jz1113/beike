import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { emptySalesCollection } from './salesCollectionDraft';
import { parseSalesProductionPlan, planForSelectedScript } from './salesProductionDraft';
import { salesProductionSourceError } from './salesPlanSource';
import { salesSpokenCopySourceKey, salesSpokenCopyTimingMatches } from './salesSpokenCopySource';

function adapted() {
  const state = emptySalesCollection();
  const script = normalizeScriptTemplate({ title: '针织衫展示', durationSec: 13.8, voiceMode: 'speech',
    shots: [{ beats: [
      { start: 0, end: 3.5, action: '展示领口' },
      { start: 3.5, end: 13.5, action: '展示条纹' },
    ] }] })!;
  state.productionPlan.adaptedBeats = [{ index: 0, subject: '当前人物', action: '展示领口', spokenLine: '条纹搭纯色下装', subtitle: '条纹搭配' }];
  state.productionPlan.spokenCopySourceKey = salesSpokenCopySourceKey(script, 'speech', 14);
  state.productionPlan.spokenCopyPromptVersion = 'spoken-copy:reviewed';
  return { state, script };
}

describe('spoken copy timing provenance', () => {
  it('round trips saved provenance without assigning it to legacy or manual drafts', () => {
    const { state } = adapted();
    const plan = parseSalesProductionPlan(JSON.parse(JSON.stringify(state.productionPlan)));
    expect(plan.spokenCopySourceKey).toBe(state.productionPlan.spokenCopySourceKey);
    expect(plan.spokenCopyPromptVersion).toBe('spoken-copy:reviewed');
    expect(parseSalesProductionPlan({})).toMatchObject({ spokenCopySourceKey: '', spokenCopyPromptVersion: '' });
    expect(planForSelectedScript(plan, 'different')).toMatchObject({ spokenCopySourceKey: '', spokenCopyPromptVersion: '' });
  });

  it('requires adaptation after a voice mode change', () => {
    const { state, script } = adapted();
    const beats = state.productionPlan.adaptedBeats;
    expect(salesProductionSourceError(state, false, script, null, { voiceMode: 'speech', durationSec: 14 })).toBe('');
    expect(salesProductionSourceError(state, false, script, null, { voiceMode: 'voiceover', durationSec: 14 })).toContain('口播时长');
    expect(state.productionPlan.adaptedBeats).toBe(beats);
  });

  it('reuses wording when only unused output padding changes', () => {
    const { state, script } = adapted();
    expect(salesProductionSourceError(state, false, script, null, { voiceMode: 'speech', durationSec: 15 })).toBe('');
    expect(salesSpokenCopyTimingMatches(state.productionPlan.spokenCopySourceKey, script, 'speech', 13)).toBe(false);
    expect(salesSpokenCopyTimingMatches('legacy', script, 'speech', 14)).toBe(false);
    expect(salesSpokenCopyTimingMatches('{}', script, 'speech', 14)).toBe(false);
  });

  it('tracks the actual beat windows and speaking rate, leaving unused tail time separate', () => {
    const { state, script } = adapted();
    const original = state.productionPlan.spokenCopySourceKey;
    script.shots[0].beats[0].end = 3;
    expect(salesSpokenCopySourceKey(script, 'speech', 14)).not.toBe(original);
    expect(salesProductionSourceError(state, false, script, null, { voiceMode: 'speech', durationSec: 14 })).toContain('口播时长');
    script.shots[0].beats[0].end = 3.5;
    script.assetSlots.audio.targetCps = 3;
    expect(salesSpokenCopySourceKey(script, 'speech', 14)).not.toBe(original);
  });

  it('does not turn manual wording edits into new model provenance', () => {
    const { state, script } = adapted();
    const key = state.productionPlan.spokenCopySourceKey;
    state.productionPlan.adaptedBeats[0].spokenLine = '人工核对后的条纹穿搭口播';
    state.productionPlan.adaptedBeats[0].subtitle = '人工字幕';
    expect(salesProductionSourceError(state, false, script, null, { voiceMode: 'speech', durationSec: 14 })).toBe('');
    expect(state.productionPlan.spokenCopySourceKey).toBe(key);
    expect(state.productionPlan.spokenCopyPromptVersion).toBe('spoken-copy:reviewed');
  });

  it('allows pure visuals and old drafts without timing provenance', () => {
    const { state, script } = adapted();
    expect(salesProductionSourceError(state, false, script, null, { voiceMode: 'none', durationSec: 30 })).toBe('');
    state.productionPlan.spokenCopySourceKey = '';
    expect(salesProductionSourceError(state, false, script, null, { voiceMode: 'voiceover', durationSec: 30 })).toBe('');
  });
});
