import type { AssembledSalesPrompt, BeatProductImageBinding } from '@shared/domain/sales';

/** Confirmation belongs to the actual reference list and its current storyboard uses. */
export function salesReferenceReviewKey(assembled: AssembledSalesPrompt, bindings: readonly BeatProductImageBinding[], scriptId: string): string {
  return JSON.stringify([
    scriptId,
    assembled.references,
    bindings.map(({ beatIndex, image, requiredView, assignedView }) => [beatIndex, image?.url, requiredView, assignedView]),
    assembled.warnings,
    assembled.imitationMode,
  ]);
}
