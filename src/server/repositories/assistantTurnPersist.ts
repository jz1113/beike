/**
 * Assistant Turn 持久化服务
 * 
 * 将 AgentRuntime 的 item 状态同步写入 DB，支持：
 * - Turn 生命周期管理（running -> completed/interrupted/failed）
 * - Item 增量写入（每个 item 事件完成时同步）
 * - Snapshot 批量更新（debounced）
 */

import { db as prisma } from './access';
import type { AgentRuntime } from '@server/infrastructure/assistant/agentRuntime';
import type { AssistantItem } from '@shared/domain/assistant/types';
import type { Prisma } from '@prisma/client';
import { AssistantThreadDeletedError, isAssistantThreadDeleted, withAssistantThreadWrite } from './assistantThreadLifecycle';

import { extractItemFields } from './assistantItemFields';
import { createAssistantExecutionRepository } from './assistantExecution';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';

/** Only the immutable execution claim may create turns; runners verify its ownership. */
export async function updateTurnModel(turnId: string, threadId: string, model?: string): Promise<void> {
  await withAssistantThreadWrite(threadId, () => prisma.$transaction(async (tx) => {
    if (await isAssistantThreadDeleted(threadId, tx)) throw new AssistantThreadDeletedError();
    const existing = await tx.assistantTurn.findUnique({ where: { id: turnId } });
    if (!existing || existing.threadId !== threadId) throw new Error('任务与当前对话不匹配');
    if (!['running', 'awaiting_approval'].includes(existing.status)) throw new Error('此任务已结束，请使用新的任务编号');
    await tx.assistantTurn.update({ where: { id: turnId }, data: { model: model || undefined } });
  }));
}

/** Late events after deletion are discarded; every read/write uses the same transaction. */
async function withPersistableTurn(
  turnId: string,
  run: (tx: Prisma.TransactionClient, turn: { threadId: string; status: string }) => Promise<void>,
  expectedThreadId?: string,
): Promise<void> {
  const current = await prisma.assistantTurn.findUnique({ where: { id: turnId }, select: { threadId: true } });
  if (!current || (expectedThreadId && current.threadId !== expectedThreadId)) return;
  await withAssistantThreadWrite(current.threadId, () => prisma.$transaction(async (tx) => {
    const turn = await tx.assistantTurn.findUnique({ where: { id: turnId }, select: { threadId: true, status: true } });
    if (!turn || turn.threadId !== current.threadId || await isAssistantThreadDeleted(turn.threadId, tx)) return;
    await run(tx, turn);
  }));
}

/** 更新 Turn 状态 */
export async function updateTurnStatus(
  turnId: string,
  status: 'completed' | 'interrupted' | 'failed' | 'awaiting_approval',
  usage?: { inputTokens: number; outputTokens: number },
  expectedThreadId?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    completedAt: status === 'awaiting_approval' ? null : new Date(),
  };

  if (usage) {
    update.usageInputTokens = usage.inputTokens;
    update.usageOutputTokens = usage.outputTokens;
  }

  await withPersistableTurn(turnId, async (tx, turn) => {
    if (['completed', 'interrupted', 'failed'].includes(turn.status) && turn.status !== status) return;
    await tx.assistantTurn.update({ where: { id: turnId }, data: update });
  }, expectedThreadId);
}

/** 同步单个 Item 到 DB */
export async function upsertItem(turnId: string, item: AssistantItem): Promise<void> {
  await withPersistableTurn(turnId, (tx) => upsertItemInTransaction(tx, turnId, item));
}

async function upsertItemInTransaction(tx: Prisma.TransactionClient, turnId: string, item: AssistantItem): Promise<void> {
  const fields = extractItemFields(item);
  const existing = await tx.assistantTurnItem.findUnique({ where: { id: item.id }, select: { turnId: true } });
  if (existing && existing.turnId !== turnId) throw new Error('消息与当前任务不匹配');
  await tx.assistantTurnItem.upsert({
    where: { id: item.id },
    create: {
      id: item.id,
      turnId,
      kind: fields.kind,
      status: fields.status,
      startedAt: new Date(item.createdAt),
      completedAt: fields.status === 'done' || fields.status === 'error' || fields.status === 'cancelled' ? new Date() : null,
      content: fields.content,
      reasoning: fields.reasoning,
      toolName: fields.toolName,
      displayName: fields.displayName,
      argsJson: fields.argsJson,
      summary: fields.summary,
      actionJson: fields.actionJson,
      visualImagesJson: fields.visualImagesJson,
      metaJson: fields.metaJson,
    },
    update: {
      status: fields.status,
      completedAt: fields.status === 'done' || fields.status === 'error' || fields.status === 'cancelled' ? new Date() : null,
      content: fields.content,
      reasoning: fields.reasoning,
      summary: fields.summary,
      actionJson: fields.actionJson,
      visualImagesJson: fields.visualImagesJson,
      argsJson: fields.argsJson,
      displayName: fields.displayName,
      toolName: fields.toolName,
      metaJson: fields.metaJson,
    },
  });
}

/** Synchronize snapshots under the same deletion barrier as item and status writes. */
export async function syncSnapshot(turnId: string, snapshot: unknown): Promise<void> {
  await withPersistableTurn(turnId, async (tx) => {
    await createAssistantExecutionRepository(tx, requireWorkspaceId).saveSnapshot(turnId, snapshot);
  });
}

/** 将 AgentRuntime 状态同步到 DB */
export async function syncRuntimeToDb(runtime: AgentRuntime, turnId: string): Promise<void> {
  const snapshot = runtime.snapshot();

  // Update turn status and snapshot
  await withPersistableTurn(turnId, async (tx, turn) => {
    if (['completed', 'interrupted', 'failed'].includes(turn.status) && turn.status !== snapshot.status) return;
    for (const item of snapshot.items) await upsertItemInTransaction(tx, turnId, item);
    await createAssistantExecutionRepository(tx, requireWorkspaceId).saveRuntime(turnId, snapshot);
  }, snapshot.threadId);
}
