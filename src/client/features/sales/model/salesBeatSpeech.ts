/** Keep per-beat counts aligned with the assembled narration summary. */
export function salesBeatSpeechStats(text: string, durationSec: number) {
  const spokenChars = text.replace(/[\s，。！？、；：“”‘’,.!?;:"'()（）-]/g, '').length;
  const actualRate = Number.isFinite(durationSec) && durationSec > 0 ? spokenChars / durationSec : 0;
  return {
    spokenChars,
    speechRate: Math.round(actualRate * 10) / 10,
    tooFast: spokenChars > 0 && actualRate > 4.6,
  };
}
