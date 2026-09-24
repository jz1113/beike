import { randomUUID } from 'node:crypto';
import { requireWorkspaceId } from '@beike/server-kit/workspaceContext';
import type { PrismaClient } from '../../repositories/access';
import { inferProductCategoryAndAnatomy } from '@beike/domain/productCategory';
import { eligiblePromptGroups, type PromptGroupCandidate } from '@beike/domain/workshopPipeline';

// Reserve before model work starts. A persisted least-recently-used queue survives
// refreshes and does not depend on a product's position within a new analysis run.
async function reserveInTransaction<T extends PromptGroupCandidate>(
  db: PrismaClient, groups: T[], title: string, props: Record<string, unknown> | null | undefined, batchId?: string,
): Promise<T | null> {
  const candidates = eligiblePromptGroups(groups, title, props);
  if (!candidates.length) return null;
  const workspaceId = requireWorkspaceId();
  const category = inferProductCategoryAndAnatomy(title, props).primaryCategory;
  const eventType = `group_rotation:${category}`;
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const history = await tx.$queryRaw<Array<{ assetId: string; lastUsed: string }>>`
          SELECT "assetId", MAX("createdAt") AS "lastUsed" FROM "PromptAssetUsageEvent"
          WHERE "workspaceId" = ${workspaceId} AND "eventType" = ${eventType} GROUP BY "assetId"`;
        const lastUsed = new Map(history.map(entry => [entry.assetId, new Date(entry.lastUsed).getTime() || 0]));
        const chosen = candidates.slice().sort((a,b) => (lastUsed.get(a.id) || 0) - (lastUsed.get(b.id) || 0))[0];
        const timestamp = new Date(Math.max(Date.now(), ...history.map(entry => new Date(entry.lastUsed).getTime() + 1 || 0))).toISOString();
        await tx.$executeRaw`INSERT INTO "PromptAssetUsageEvent" ("id", "workspaceId", "assetId", "batchId", "eventType", "createdAt", "metadata")
          VALUES (${randomUUID()}, ${workspaceId}, ${chosen.id}, ${batchId || 'group-rotation'}, ${eventType}, ${timestamp}, ${'{}'})`;
        return chosen;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 4 || !/P2034|SQLITE_BUSY|database is locked|write conflict/i.test(message + String((error as { code?: string }).code))) throw error;
      await new Promise(resolve => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
}

const reservations = new Map<string, Promise<unknown>>();

export async function reservePromptGroup<T extends PromptGroupCandidate>(
  db: PrismaClient, groups: T[], title: string, props: Record<string, unknown> | null | undefined, batchId?: string,
): Promise<T | null> {
  const key = requireWorkspaceId();
  const previous = reservations.get(key) || Promise.resolve();
  const pending = previous.catch(() => undefined).then(() => reserveInTransaction(db, groups, title, props, batchId));
  reservations.set(key, pending);
  try { return await pending; }
  finally { if (reservations.get(key) === pending) reservations.delete(key); }
}
