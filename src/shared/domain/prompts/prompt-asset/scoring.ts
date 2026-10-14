export const LOW_SAMPLE_THRESHOLD = 10;

export interface UsageCounts {
  recommended: number;
  locked: number;
  analysisUsed: number;
  submitted: number;
  succeeded: number;
  failed: number;
  accepted: number;
  retried: number;
  rejected: number;
  exported: number;
}

export interface ScoreBreakdown {
  productFidelity: number;
  composition: number;
  aesthetic: number;
  consistency: number;
}

export const emptyUsageCounts = (): UsageCounts => ({
  recommended: 0,
  locked: 0,
  analysisUsed: 0,
  submitted: 0,
  succeeded: 0,
  failed: 0,
  accepted: 0,
  retried: 0,
  rejected: 0,
  exported: 0,
});

export function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

export function generationSuccessRate(counts: UsageCounts): number {
  return ratio(counts.succeeded, counts.submitted);
}

export function firstPassAcceptRate(counts: UsageCounts): number {
  return ratio(counts.accepted + counts.exported, counts.succeeded);
}

export function retryRate(counts: UsageCounts): number {
  return ratio(counts.retried, counts.succeeded);
}

export function rejectRate(counts: UsageCounts): number {
  const reviewed = counts.accepted + counts.retried + counts.rejected;
  return ratio(counts.rejected, reviewed);
}

export function exportRate(counts: UsageCounts): number {
  return ratio(counts.exported, counts.succeeded);
}

export function isLowSample(counts: UsageCounts): boolean {
  return counts.submitted < LOW_SAMPLE_THRESHOLD;
}

export function qualityScoreFromBreakdown(scores: ScoreBreakdown): number {
  return clamp(
    scores.productFidelity * 0.35
    + scores.composition * 0.25
    + scores.aesthetic * 0.2
    + scores.consistency * 0.2,
  );
}

export function aggregateQualityScore(input: {
  breakdown?: ScoreBreakdown;
  counts: UsageCounts;
}): { score: number | null; confidence: number; lowSample: boolean } {
  const lowSample = isLowSample(input.counts);
  if (!input.breakdown && input.counts.succeeded === 0) {
    return { score: null, confidence: 0, lowSample };
  }
  const fromReviews = input.breakdown ? qualityScoreFromBreakdown(input.breakdown) : null;
  const fromOutcomes = clamp(
    generationSuccessRate(input.counts) * 100 * 0.35
    + firstPassAcceptRate(input.counts) * 100 * 0.35
    + (1 - retryRate(input.counts)) * 100 * 0.15
    + (1 - rejectRate(input.counts)) * 100 * 0.15,
  );
  if (fromReviews == null) {
    return { score: lowSample ? null : fromOutcomes, confidence: lowSample ? 0.2 : 0.55, lowSample };
  }
  const score = lowSample ? fromReviews : fromReviews * 0.7 + fromOutcomes * 0.3;
  return { score, confidence: lowSample ? 0.4 : 0.85, lowSample };
}

export function shouldAutoDemote(counts: UsageCounts, qualityScore: number | null): boolean {
  if (isLowSample(counts)) return false;
  if (qualityScore != null && qualityScore < 40) return true;
  if (retryRate(counts) > 0.45 && counts.succeeded >= LOW_SAMPLE_THRESHOLD) return true;
  if (rejectRate(counts) > 0.4) return true;
  if (generationSuccessRate(counts) < 0.5 && counts.submitted >= LOW_SAMPLE_THRESHOLD) return true;
  return false;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
