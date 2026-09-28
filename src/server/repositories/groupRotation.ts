import { randomUUID } from 'node:crypto';
import { db } from './access';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import type { PromptGroupCandidate } from '@shared/domain/workshop/workshopPipeline';

export async function reservePromptGroupRecord<T extends PromptGroupCandidate>(
  candidates: T[], eventType: string, batchId?: string,
): Promise<T> {
  const workspaceId = requireWorkspaceId();
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
