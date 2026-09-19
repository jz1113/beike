/**
 * Assistant Turn 持久化服务
 * 
 * 将 AgentRuntime 的 item 状态同步写入 DB，支持：
 * - Turn 生命周期管理（running -> completed/interrupted/failed）
 * - Item 增量写入（每个 item 事件完成时同步）
 * - Snapshot 批量更新（debounced）
 */

import { prisma } from '@beike/server-kit/prisma';
import type { AgentRuntime } from '@beike/server-kit/assistant/agentRuntime';
import type { AssistantItem } from '@beike/domain/assistant/types';

let snapshotDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const SNAPSHOT_DEBOUNCE_MS = 100;

/** 提取 AssistantItem 的可存储字段 */
export function extractItemFields(item: AssistantItem): {
  kind: string;
  status: string;
  content: string;
  reasoning: string;
  toolName: string | null;
  displayName: string | null;
  argsJson: string;
  summary: string | null;
  actionJson: string | null;
  visualImagesJson: string | null;
  metaJson: string;
} {
  const base = {
    kind: item.kind,
    status: 'done',
    content: '',
    reasoning: '',
    toolName: null as string | null,
    displayName: null as string | null,
    argsJson: '{}',
    summary: null as string | null,
    actionJson: null as string | null,
    visualImagesJson: null as string | null,
    metaJson: '{}',
  };

  switch (item.kind) {
    case 'agentMessage':
      return { ...base, kind: 'agentMessage', content: (item as { content: string }).content || '' };
    case 'agentReasoning':
      return { ...base, kind: 'agentReasoning', reasoning: (item as { content: string }).content || '' };
    case 'toolCall': {
      const tc = item as { name: string; displayName?: string; args?: string; callId?: string };
      return {
        ...base,
        kind: 'toolCall',
        toolName: tc.name,
        displayName: tc.displayName || tc.name,
        argsJson: tc.args || '{}',
        status: (item as { status: string }).status === 'done' ? 'done' : (item as { status: string }).status === 'error' ? 'error' : 'running',
      };
    }
    case 'toolResult': {
      const tr = item as { name: string; displayName?: string; summary?: string; action?: Record<string, unknown> };
      return {
        ...base,
        kind: 'toolResult',
        toolName: tr.name,
        displayName: tr.displayName || tr.name,
        summary: tr.summary || '',
        actionJson: tr.action ? JSON.stringify(tr.action) : null,
        status: (item as { status: string }).status === 'done' ? 'done' : 'error',
      };
    }
    case 'approvalRequest': {
      const ar = item as { toolName: string; displayName?: string; args?: Record<string, unknown>; status?: string };
      const approvalStatus =
        ar.status === 'accepted' ? 'done'
        : ar.status === 'declined' ? 'error'
        : ar.status === 'expired' ? 'cancelled'
        : 'running';
      return {
        ...base,
        kind: 'approvalRequest',
        toolName: ar.toolName,
        displayName: ar.displayName || ar.toolName,
        argsJson: JSON.stringify(ar.args || {}),
        status: approvalStatus,
      };
    }
    default:
      return { ...base, kind: 'userMessage', content: (item as { content: string }).content || '' };
  }
}

/** 创建或更新 Turn 记录 */
export async function upsertTurn(turnId: string, threadId: string, model?: string): Promise<void> {
  await prisma.assistantTurn.upsert({
    where: { id: turnId },
    create: {
      id: turnId,
      threadId,
      model: model || null,
      status: 'running',
      startedAt: new Date(),
      snapshotJson: '{}',
    },
    update: {
      model: model || undefined,
    },
  });
}

/** 更新 Turn 状态 */
export async function updateTurnStatus(
  turnId: string,
  status: 'completed' | 'interrupted' | 'failed' | 'awaiting_approval',
  usage?: { inputTokens: number; outputTokens: number },
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    completedAt: status === 'awaiting_approval' ? null : new Date(),
  };

  if (usage) {
    update.usageInputTokens = usage.inputTokens;
    update.usageOutputTokens = usage.outputTokens;
  }

  await prisma.assistantTurn.update({
    where: { id: turnId },
    data: update,
  });
}

/** 同步单个 Item 到 DB */
export async function upsertItem(turnId: string, item: AssistantItem): Promise<void> {
  const fields = extractItemFields(item);

  await prisma.assistantTurnItem.upsert({
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
    },
  });
}

/** 批量同步 Items 到 DB */
export async function upsertItems(turnId: string, items: AssistantItem[]): Promise<void> {
  if (items.length === 0) return;

  await prisma.$transaction(
    items.map((item) => {
      const fields = extractItemFields(item);
      return prisma.assistantTurnItem.upsert({
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
        },
      });
    }),
  );
}

/** 更新 Turn 的 snapshotJson（debounced） */
export function scheduleSnapshotUpdate(turnId: string, snapshot: unknown): void {
  if (snapshotDebounceTimer) {
    clearTimeout(snapshotDebounceTimer);
  }

  snapshotDebounceTimer = setTimeout(async () => {
    try {
      await prisma.assistantTurn.update({
        where: { id: turnId },
        data: {
          snapshotJson: JSON.stringify(snapshot),
        },
      });
    } catch (error) {
      console.error('[TurnPersist] Failed to update snapshot:', error);
    }
    snapshotDebounceTimer = null;
  }, SNAPSHOT_DEBOUNCE_MS);
}

/** 立即同步 snapshot（不 debounce） */
export async function syncSnapshot(turnId: string, snapshot: unknown): Promise<void> {
  if (snapshotDebounceTimer) {
    clearTimeout(snapshotDebounceTimer);
    snapshotDebounceTimer = null;
  }

  await prisma.assistantTurn.update({
    where: { id: turnId },
    data: {
      snapshotJson: JSON.stringify(snapshot),
    },
  });
}

/** 将 AgentRuntime 状态同步到 DB */
export async function syncRuntimeToDb(runtime: AgentRuntime, turnId: string): Promise<void> {
  const snapshot = runtime.snapshot();

  // Update turn status and snapshot
  await prisma.assistantTurn.update({
    where: { id: turnId },
    data: {
      status: snapshot.status,
      completedAt: snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'interrupted' ? new Date() : null,
      usageInputTokens: snapshot.usage?.inputTokens,
      usageOutputTokens: snapshot.usage?.outputTokens,
      model: snapshot.modelUsed || null,
      snapshotJson: JSON.stringify(snapshot),
    },
  });

  // Sync items
  if (snapshot.items.length > 0) {
    await upsertItems(turnId, snapshot.items);
  }
}
