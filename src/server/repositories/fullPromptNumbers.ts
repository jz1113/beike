import { db } from './access';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { isFullPromptGroupVisible, type FullPromptGroupVisibilityInput } from '@shared/domain/assets/fullPromptGroupVisibility';
import {
  ensureWorkspaceFullPromptNumbers,
  readWorkspaceFullPromptNumbers,
  workspaceHasUnnumberedFullPrompts,
} from '@server/infrastructure/database/workspaceFullPromptNumbers';

/** Public group numbers belong to the current library, including its shared official assets. */
export async function readFullPromptLibraryNumbers(): Promise<Map<string, number>> {
  const workspaceId = requireWorkspaceId();
  if (await workspaceHasUnnumberedFullPrompts(db, workspaceId)) {
    await db.$transaction(tx => ensureWorkspaceFullPromptNumbers(tx, workspaceId), { timeout: 30_000 });
  }
  const numbers = await readWorkspaceFullPromptNumbers(db, workspaceId);
  return new Map(numbers.map(row => [row.assetId, row.displayNumber]));
}

export async function attachFullPromptLibraryNumbers<T extends { id: string } & FullPromptGroupVisibilityInput>(items: T[]) {
  if (!items.length) return [];
  const numbers = await readFullPromptLibraryNumbers();
  return items.map(item => ({ ...item, displayNumber: isFullPromptGroupVisible(item) ? numbers.get(item.id) ?? null : null }));
}
