interface SalesSubtitleCue {
  start: number;
  end: number;
  text: string;
}

function timestamp(milliseconds: number): string {
  const wholeSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor(wholeSeconds / 60) % 60;
  const seconds = wholeSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`;
}

/** Export the actual beat times; skip empty/invalid cues without stretching the timeline. */
export function salesSubtitlesSrt(subtitles: readonly SalesSubtitleCue[]): string {
  const cues = subtitles.flatMap((cue) => {
    const start = Math.round(Math.max(0, cue.start) * 1000);
    const end = Math.round(cue.end * 1000);
    const text = cue.text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean).join('\r\n');
    if (!text || !Number.isFinite(cue.start) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return [];
    return [{ start, end, text }];
  }).sort((a, b) => a.start - b.start);
  return cues.map((cue, index) => `${index + 1}\r\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\r\n${cue.text}\r\n`).join('\r\n');
}
