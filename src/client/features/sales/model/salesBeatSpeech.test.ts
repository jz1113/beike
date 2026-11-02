import { describe, expect, it } from 'vitest';
import { salesBeatSpeechStats } from './salesBeatSpeech';

describe('per-beat speech guidance', () => {
  it('uses the real duration for beats shorter than one second', () => {
    expect(salesBeatSpeechStats('轻盈透气', 0.4)).toEqual({ spokenChars: 4, speechRate: 10, tooFast: true });
  });

  it('excludes whitespace and punctuation counted out of the narration summary', () => {
    expect(salesBeatSpeechStats(' 轻盈，透气！\n（柔软） ', 2)).toEqual({ spokenChars: 6, speechRate: 3, tooFast: false });
  });

  it('applies the same natural speech limit as the full-script warning', () => {
    expect(salesBeatSpeechStats('字'.repeat(23), 5).tooFast).toBe(false);
    expect(salesBeatSpeechStats('字'.repeat(24), 5).tooFast).toBe(true);
  });

  it('does not produce invalid rates for empty speech or invalid durations', () => {
    expect(salesBeatSpeechStats('，。\n', 0.4)).toEqual({ spokenChars: 0, speechRate: 0, tooFast: false });
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(salesBeatSpeechStats('轻盈', duration)).toEqual({ spokenChars: 2, speechRate: 0, tooFast: false });
    }
  });
});
