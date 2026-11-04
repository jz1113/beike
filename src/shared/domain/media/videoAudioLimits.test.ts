import { describe, expect, it } from 'vitest';
import { referenceAudioDurationLimits } from './videoAudioLimits';

describe('video reference audio duration limits', () => {
  it.each(['MiniMax-H3', 'minimax-h3', 'h3', 'provider/MiniMax-H3'])('budgets %s reference audio within fifteen seconds', (model) => {
    expect(referenceAudioDurationLimits(model)).toEqual({ minSeconds: 2, maxSeconds: 15, totalMaxSeconds: 15 });
  });

  it.each(['viduq4-preview', 'vidu-q4-preview', 'viduq4', 'provider/VIDUQ4'])('keeps %s limits per clip without imposing a combined budget', (model) => {
    expect(referenceAudioDurationLimits(model)).toEqual({ minSeconds: 3, maxSeconds: 12 });
  });

  it.each(['doubao-seedance-2.0-mini', 'doubao-seedance-2-0-fast-260128'])('budgets %s audio clips within fifteen seconds', (model) => {
    expect(referenceAudioDurationLimits(model)).toEqual({ minSeconds: 2, maxSeconds: 15, totalMaxSeconds: 15 });
  });

  it.each(['doubao-seedance-2.5', 'doubao-seedance-2-5-260628'])('budgets %s audio clips within thirty seconds', (model) => {
    expect(referenceAudioDurationLimits(model)).toEqual({ minSeconds: 2, maxSeconds: 30, totalMaxSeconds: 30 });
  });

  it.each(['wan3.0-video', 'wan3.0-video-prime'])('keeps %s minimum and combined budget', (model) => {
    expect(referenceAudioDurationLimits(model)).toEqual({ minSeconds: 1, maxSeconds: 15, totalMaxSeconds: 15 });
  });

  it.each(['', 'unknown-video', 'viduq3', 'viduq4-pro', 'wan3.1-video', 'wan3.5-video', 'doubao-seedance-1-0-pro-250528', 'doubao-seedance-2.1', 'doubao-seedance-2.05'])('does not expose reference audio duration support for %s', (model) => {
    expect(referenceAudioDurationLimits(model)).toBeNull();
  });
});
