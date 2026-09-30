import { createHash } from 'node:crypto';
import { db, type PrismaClient } from './access';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import type { TurnStartBody } from '@shared/contracts/assistant';
import type { AssistantTurn } from '@shared/domain/assistant/types';
import { AssistantThreadDeletedError, isAssistantThreadDeleted, withAssistantThreadWrite } from './assistantThreadLifecycle';

interface StoredExecution { id: string; threadId: string; status: string; snapshotJson: string }
export type AssistantExecutionClaim = { outcome: 'claimed' } | { outcome: 'existing'; turn: StoredExecution } | { outcome: 'conflict' };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function assistantRequestFingerprint(body: TurnStartBody, credentials: { baseUrl: string; apiKey: string }): string {
  const input = { ...body };
  delete input.turnId;
  delete input.customApiKey;
  return createHash('sha256').update(canonical({ input, credentials })).digest('hex');
}

/** Raw queries explicitly retain workspace isolation; only hashes enter private metadata. */
export function createAssistantExecutionRepository(database: Pick<PrismaClient, '$executeRaw' | '$queryRaw'>, workspace: () => string) {
  return {
    async claim(turnId: string, threadId: string, fingerprint: string, model: string): Promise<AssistantExecutionClaim> {
      const workspaceId = workspace();
      const metadata = JSON.stringify({ _execution: { version: 1, fingerprint } });
      const inserted = await database.$executeRaw`
        INSERT INTO "AssistantTurn" ("id", "workspaceId", "threadId", "model", "status", "startedAt", "snapshotJson")
        VALUES (${turnId}, ${workspaceId}, ${threadId}, ${model}, 'running', ${new Date()}, ${metadata})
        ON CONFLICT("id") DO NOTHING`;
      if (inserted === 1) return { outcome: 'claimed' };
      const rows = await database.$queryRaw<StoredExecution[]>`
        SELECT "id", "threadId", "status", "snapshotJson" FROM "AssistantTurn" WHERE "id" = ${turnId} AND "workspaceId" = ${workspaceId}`;
      const turn = rows[0];
      if (!turn) return { outcome: 'conflict' }; // Do not disclose another workspace's identity.
      let savedFingerprint: unknown;
      try { savedFingerprint = JSON.parse(turn.snapshotJson)._execution?.fingerprint; } catch { /* Legacy turn remains non-executable. */ }
      if (turn.threadId !== threadId || (savedFingerprint !== undefined && savedFingerprint !== fingerprint)) return { outcome: 'conflict' };
      return { outcome: 'existing', turn };
    },
    async saveSnapshot(turnId: string, snapshot: unknown): Promise<void> {
      const workspaceId = workspace();
      await database.$executeRaw`UPDATE "AssistantTurn" SET "snapshotJson" =
        json_set(${JSON.stringify(snapshot)}, '$._execution', json_extract("snapshotJson", '$._execution'))
        WHERE "id" = ${turnId} AND "workspaceId" = ${workspaceId}`;
    },
    async saveRuntime(turnId: string, snapshot: AssistantTurn): Promise<void> {
      const workspaceId = workspace();
      const completedAt = ['completed', 'failed', 'interrupted'].includes(snapshot.status) ? new Date() : null;
      await database.$executeRaw`UPDATE "AssistantTurn" SET "status" = ${snapshot.status}, "completedAt" = ${completedAt},
        "usageInputTokens" = ${snapshot.usage?.inputTokens ?? null}, "usageOutputTokens" = ${snapshot.usage?.outputTokens ?? null},
        "model" = ${snapshot.modelUsed ?? null}, "snapshotJson" =
        json_set(${JSON.stringify(snapshot)}, '$._execution', json_extract("snapshotJson", '$._execution'))
        WHERE "id" = ${turnId} AND "workspaceId" = ${workspaceId}`;
    },
    async settle(turnId: string, status: 'interrupted'): Promise<void> {
      const workspaceId = workspace();
      await database.$executeRaw`UPDATE "AssistantTurn" SET "status" = ${status}, "completedAt" = ${new Date()}
        WHERE "id" = ${turnId} AND "workspaceId" = ${workspaceId} AND "status" IN ('running', 'awaiting_approval')`;
    },
  };
}
export const assistantExecutionRepository = {
  claim: (turnId: string, threadId: string, fingerprint: string, model: string) =>
    withAssistantThreadWrite(threadId, () => db.$transaction(async tx => {
      if (await isAssistantThreadDeleted(threadId, tx)) throw new AssistantThreadDeletedError();
      return createAssistantExecutionRepository(tx, requireWorkspaceId).claim(turnId, threadId, fingerprint, model);
    })),
  async settle(turnId: string, status: 'interrupted') {
    const turn = await db.assistantTurn.findUnique({ where: { id: turnId }, select: { threadId: true } });
    if (!turn) return;
    await withAssistantThreadWrite(turn.threadId, () => db.$transaction(async tx => {
      if (await isAssistantThreadDeleted(turn.threadId, tx)) return;
      await createAssistantExecutionRepository(tx, requireWorkspaceId).settle(turnId, status);
    }));
  },
};
