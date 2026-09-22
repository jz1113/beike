/**
 * 流式 item 持久化队列
 *
 * 目标：在不阻塞主 SSE 流的前提下，把每个 item 的生命周期事件尽快写入 AssistantTurnItem。
 * - 失败重试 3 次后丢日志，不抛出
 * - 单线程顺序写，避免并发 Prisma 事务冲突
 * - 高峰期自动丢弃最新事件（队列上限 5000），优先保证流式响应
 */

import { db } from '../repositories/access';
import type { AssistantItem } from '@beike/domain/assistant/types';
import { extractItemFields } from './assistantTurnPersist';

const QUEUE_MAX = 5000;
const RETRY_LIMIT = 3;

interface PersistTask {
  turnId: string;
  item: AssistantItem;
  attempts: number;
}

const queue: PersistTask[] = [];
let drainPromise: Promise<void> | null = null;
let droppedCount = 0;

export function getDroppedItemCount(): number {
  return droppedCount;
}

function enqueue(task: PersistTask): void {
  if (queue.length >= QUEUE_MAX) {
    droppedCount += 1;
    const dropped = queue.shift();
    console.warn('[ItemPersistQueue] queue full, dropped oldest event', {
      droppedCount,
      droppedTurnId: dropped?.turnId,
      droppedItemId: dropped?.item.id,
    });
  }
  queue.push(task);
}

/** 收到 SSE item 事件时调用：把当前 item 状态入队 */
export function enqueueItemPersist(turnId: string, item: AssistantItem): void {
  if (!turnId || !item?.id) return;
  // 去重：如果最新一条同 id 且 status 相同则跳过；否则替换
  const last = queue[queue.length - 1];
  if (last && last.turnId === turnId && last.item.id === item.id) {
    queue[queue.length - 1] = { ...last, item };
    return;
  }
  enqueue({ turnId, item, attempts: 0 });
}

async function persistOne(task: PersistTask): Promise<void> {
  const fields = extractItemFields(task.item);
  await db.assistantTurnItem.upsert({
    where: { id: task.item.id },
    create: {
      id: task.item.id,
      turnId: task.turnId,
      kind: fields.kind,
      status: fields.status,
      startedAt: new Date(task.item.createdAt),
      completedAt:
        fields.status === 'done' || fields.status === 'error' || fields.status === 'cancelled'
          ? new Date()
          : null,
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
      completedAt:
        fields.status === 'done' || fields.status === 'error' || fields.status === 'cancelled'
          ? new Date()
          : null,
      content: fields.content,
      reasoning: fields.reasoning,
      summary: fields.summary,
      actionJson: fields.actionJson,
      visualImagesJson: fields.visualImagesJson,
    },
  });
}

async function drainLoop(opts?: { throwOnError?: boolean }): Promise<void> {
  if (drainPromise) return drainPromise;
  drainPromise = (async () => {
    try {
      while (queue.length > 0) {
        const task = queue.shift()!;
        try {
          await persistOne(task);
        } catch (err) {
          task.attempts += 1;
          const newerQueued = queue.some((queued) => queued.turnId === task.turnId && queued.item.id === task.item.id);
          if (newerQueued) continue;
          if (opts?.throwOnError || task.attempts < RETRY_LIMIT) {
            enqueue(task);
          } else {
            console.warn('[ItemPersistQueue] failed after retries', {
              turnId: task.turnId,
              itemId: task.item.id,
              err,
            });
          }
          if (opts?.throwOnError) throw err;
          await new Promise((r) => setTimeout(r, 25 * Math.max(1, task.attempts)));
        }
      }
    } finally {
      drainPromise = null;
    }
  })();
  return drainPromise;
}

/**
 * 后台驱动队列出队。一般不需要调用，启动时自动 setInterval 触发。
 * 测试时可显式调用一次。
 */
export function pumpItemQueue(): void {
  if (queue.length === 0) return;
  void drainLoop();
}

if (typeof setInterval !== 'undefined' && process.env.VITEST !== 'true') {
  const timer = setInterval(pumpItemQueue, 100);
  if (typeof timer === 'object' && timer && 'unref' in timer) (timer as NodeJS.Timeout).unref();
}

/** 测试用：等待队列清空；失败时把任务留在队列并抛出 */
export async function flushItemQueue(): Promise<void> {
  await drainLoop({ throwOnError: true });
}
