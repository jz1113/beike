import type { SalesSpokenCopyInput } from '@shared/contracts/salesSpokenCopy';
import type { BeatProductImageBinding, SalesBeatVoiceMode, SalesScriptDomain } from '@shared/domain/sales';
import { omitSourceSpeechCues, resolveSalesProductSlots } from '@shared/domain/sales/promptInputs';
import type { SalesCollectionState } from './salesCollectionDraft';
import { salesPlanSource, salesProductionSummaryIsStale } from './salesPlanSource';

/** Review the actual retained draft; source dialogue and generated copy never establish facts. */
export function salesSpokenReviewInput(
  state: SalesCollectionState,
  script: SalesScriptDomain,
  bindings: readonly BeatProductImageBinding[],
  voiceMode: SalesBeatVoiceMode,
  duration: number,
  truncatedEnding = false,
): SalesSpokenCopyInput | null {
  if (voiceMode === 'none') return null;
  const summary = salesProductionSummaryIsStale(state) ? undefined : state.productSummary;
  const adapted = new Map(state.productionPlan.adaptedBeats.map((beat) => [beat.index, beat]));
  let index = 0;
  const count = script.shots.reduce((total, shot) => total + shot.beats.length, 0);
  const visual = (text: string) => resolveSalesProductSlots(omitSourceSpeechCues(text, voiceMode === 'speech'));
  return {
    reviewOnly: true,
    productName: state.productName, facts: salesPlanSource(state).facts,
    summary: summary?.result.summary || '', sourceCopy: summary ? summary.editedCopy ?? summary.result.copy : '',
    buyingPoints: summary?.result.points.map((point) => [point.feature, point.benefit].filter(Boolean).join('；')) || [],
    unresolved: [...summary?.result.conflicts || [], ...summary?.result.questions || []],
    cautions: summary?.result.cautions || [], voiceMode, duration,
    targetCps: Math.min(4.6, Math.max(2, script.assetSlots.audio.targetCps || 3.8)),
    sourceExclusions: script.sourceExclusions.flatMap((item) => item.term.split(/[、，,/；;\s]+/)
      .map((term) => ({ term: term.trim(), type: item.type })).filter((item) => item.term.length >= 2)),
    beats: script.shots.flatMap((shot, shotIndex) => shot.beats.map((beat) => {
      const currentIndex = index++;
      const current = adapted.get(currentIndex);
      const action = current?.action?.trim();
      return {
        index: currentIndex, start: beat.start, end: beat.end, shotIndex, shotSize: beat.shotSize, camera: beat.camera,
        requiredView: beat.requiredView, assignedView: bindings[currentIndex]?.assignedView || 'untagged',
        subject: visual(current?.manualPerformanceFields?.includes('subject')
          ? current.subject || '' : current?.subject?.trim() || (!action ? beat.subject : '')),
        action: visual(action || beat.actionTemplate || beat.action),
        expression: visual(current?.expression ?? (!action ? beat.expression : '')),
        transition: truncatedEnding && currentIndex === count - 1 ? '' : visual(current?.transition ?? (!action ? beat.transition : '')),
        purpose: beat.purpose, spokenLine: current?.spokenLine || '', subtitle: current?.subtitle || '',
      };
    })),
  };
}

/** Bind approval to the complete submitted text and evidence, including manual dialogue/subtitle edits. */
export function salesSpokenReviewSourceKey(input: SalesSpokenCopyInput | null): string {
  return input ? JSON.stringify(['spoken-review-v1', input]) : '';
}
