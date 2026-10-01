import type { AssetLibrarySlim } from './assetLibraryTypes';

/** A full-prompt group's visible name is its persisted library number, never its current list position. */
export function fullPromptGroupLabel(displayNumber: unknown): string {
  return typeof displayNumber === 'number' && Number.isSafeInteger(displayNumber) && displayNumber > 0
    ? `组 ${displayNumber}`
    : '未编号图组';
}

type NumberedGroup = Pick<AssetLibrarySlim, 'displayNumber' | 'createdAt' | 'id'>;

function groupNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function creationTime(value: NumberedGroup['createdAt']): number {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

/** Assigned group numbers lead; unnumbered records keep a deterministic creation/id order. */
export function compareFullPromptGroupOrder(left: NumberedGroup, right: NumberedGroup): number {
  const leftNumber = groupNumber(left.displayNumber);
  const rightNumber = groupNumber(right.displayNumber);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
  if (leftNumber !== null && rightNumber === null) return -1;
  if (leftNumber === null && rightNumber !== null) return 1;
  return creationTime(left.createdAt) - creationTime(right.createdAt)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}
