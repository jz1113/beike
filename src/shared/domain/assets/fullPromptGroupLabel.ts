/** A full-prompt group's visible name is its persisted library number, never its current list position. */
export function fullPromptGroupLabel(displayNumber: unknown): string {
  return typeof displayNumber === 'number' && Number.isSafeInteger(displayNumber) && displayNumber > 0
    ? `组 ${displayNumber}`
    : '未编号图组';
}
