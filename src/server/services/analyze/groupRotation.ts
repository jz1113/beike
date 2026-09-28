import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { inferProductCategoryAndAnatomy } from '@shared/domain/products/productCategory';
import { eligiblePromptGroups, type PromptGroupCandidate } from '@shared/domain/workshop/workshopPipeline';
import { reservePromptGroupRecord } from '../../repositories/groupRotation';

// Reserve before model work starts. A persisted least-recently-used queue survives
// refreshes and does not depend on a product's position within a new analysis run.
async function reserveInTransaction<T extends PromptGroupCandidate>(
  groups: T[], title: string, props: Record<string, unknown> | null | undefined, batchId?: string,
): Promise<T | null> {
  const candidates = eligiblePromptGroups(groups, title, props);
  if (!candidates.length) return null;
  const category = inferProductCategoryAndAnatomy(title, props).primaryCategory;
  const eventType = `group_rotation:${category}`;
  return reservePromptGroupRecord(candidates, eventType, batchId);
}

const reservations = new Map<string, Promise<unknown>>();

export async function reservePromptGroup<T extends PromptGroupCandidate>(
  groups: T[], title: string, props: Record<string, unknown> | null | undefined, batchId?: string,
): Promise<T | null> {
  const key = requireWorkspaceId();
  const previous = reservations.get(key) || Promise.resolve();
  const pending = previous.catch(() => undefined).then(() => reserveInTransaction(groups, title, props, batchId));
  reservations.set(key, pending);
  try { return await pending; }
  finally { if (reservations.get(key) === pending) reservations.delete(key); }
}
