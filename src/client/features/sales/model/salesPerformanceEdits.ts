import type { SalesAdaptedBeat } from '@shared/domain/sales';
import type { SalesProductionPlanState } from './salesProductionDraft';

type PerformanceField = NonNullable<SalesAdaptedBeat['manualPerformanceFields']>[number];
type PerformanceEdits = Partial<Pick<SalesAdaptedBeat, PerformanceField>>;
const performanceFields = ['action', 'expression', 'transition'] as const;
const editableFields = [...performanceFields, 'subject'] as const;

/** Only explicit user edits, including legacy manual drafts, survive an automatic rewrite. */
export function salesManualPerformanceEdits(plan: SalesProductionPlanState, beat?: SalesAdaptedBeat): PerformanceEdits {
  if (!beat) return {};
  const legacyManual = !plan.adaptedSourceKey && !plan.adaptedPromptVersion;
  const fields = beat.manualPerformanceFields ?? (legacyManual ? performanceFields : []);
  const edits: PerformanceEdits = {};
  for (const field of fields) {
    const value = beat[field];
    if (typeof value === 'string' && (field !== 'action' || value.trim())) edits[field] = value;
  }
  return edits;
}

export function updateSalesManualPerformance(plan: SalesProductionPlanState, beat: SalesAdaptedBeat, patch: Partial<SalesAdaptedBeat>): SalesAdaptedBeat {
  const edits = salesManualPerformanceEdits(plan, beat);
  for (const field of editableFields) {
    const value = patch[field];
    if (typeof value !== 'string') continue;
    if (field === 'action' && !value.trim()) delete edits.action;
    else edits[field] = value;
  }
  return { ...beat, ...patch, manualPerformanceFields: Object.keys(edits) as PerformanceField[] };
}

/** A shorter production window must not discard edits needed when the full script is selected again. */
export function mergeSalesAdaptedWindow(current: readonly SalesAdaptedBeat[], updated: readonly SalesAdaptedBeat[], activeBeatCount: number): SalesAdaptedBeat[] {
  const merged = new Map(current.filter((beat) => beat.index >= activeBeatCount).map((beat) => [beat.index, beat]));
  for (const beat of updated) merged.set(beat.index, beat);
  return [...merged.values()].sort((a, b) => a.index - b.index);
}
