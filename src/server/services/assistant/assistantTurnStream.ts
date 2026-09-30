import type { TurnStartBody } from '@shared/contracts/assistant';
import type { AssistantSSEEvent } from '@shared/domain/assistant/events';
import type { TurnStatus } from '@shared/domain/assistant/types';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { safeErrorMessage } from '../../core/validate';
import { jsonResponse } from '../../core/http';
import { rejectTurnApprovals } from './assistantApprovalStore';
import { updateTurnStatus } from '@server/repositories/assistantTurnPersist';
import { flushItemQueue } from '../library/itemPersistQueue';

import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
const scopedKey = (turnId: string) => JSON.stringify([requireWorkspaceId(), turnId]);

interface ActiveTurn {
  workspaceId: string;
  turnId: string;
  controller: AbortController;
  threadId: string;
  finished: Promise<void>;
}
const activeTurnControllers = new Map<string, ActiveTurn>();
/** The desktop sidecar/Hono API has one process; this registry owns all live workers. */
export function isAssistantTurnActive(turnId: string): boolean {
  const active = activeTurnControllers.get(scopedKey(turnId));
  return Boolean(active && !active.controller.signal.aborted);
}

export function getEffectiveAssistantTurnStatus(turnId: string, status: string): TurnStatus {
  if (['running', 'awaiting_approval'].includes(status) && !isAssistantTurnActive(turnId)) return 'interrupted';
  return ['running', 'awaiting_approval', 'completed', 'interrupted', 'failed'].includes(status) ? status as TurnStatus : 'failed';
}
export function interruptActiveAssistantTurn(turnId: string): boolean {
  const active = activeTurnControllers.get(scopedKey(turnId));
  active?.controller.abort();
  return Boolean(active);
}

/** Stop all work for an explicitly deleted thread, including any outstanding approvals. */
export function interruptAssistantThreadTurns(threadId: string): string[] {
  const active = [...activeTurnControllers.entries()].filter(([, run]) => run.workspaceId === requireWorkspaceId() && run.threadId === threadId);
  for (const [, run] of active) {
    run.controller.abort();
    rejectTurnApprovals(run.turnId);
  }
  return active.map(([, run]) => run.turnId);
}

export async function stopAssistantThreadTurns(threadId: string): Promise<string[]> {
  interruptAssistantThreadTurns(threadId);
  const active = [...activeTurnControllers.entries()].filter(([, run]) => run.workspaceId === requireWorkspaceId() && run.threadId === threadId);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(active.map(([, run]) => run.finished)),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('任务仍在停止，请稍后重试删除')), 10_000); }),
    ]);
  } finally { if (timeout) clearTimeout(timeout); }
  return active.map(([, run]) => run.turnId);
}

export function newTurnId() {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface RunAssistantTurnOptions {
  req: Request;
  body: TurnStartBody;
  signal?: AbortSignal;
  send: (evt: AssistantSSEEvent) => void;
}

/** Every preparation or runtime failure must close the stream and leave a terminal DB state. */
export async function runWithTurnLifecycle(opts: RunAssistantTurnOptions, execute: (opts: RunAssistantTurnOptions) => Promise<void>): Promise<void> {
  const turnId = opts.body.turnId?.trim() || newTurnId();
  let failed = false;
  let interrupted = false;
  let done = false;
  let completed = false;
  const send = (event: AssistantSSEEvent) => {
    if (event.type === 'error') failed = true;
    if (event.type === 'turn/interrupted') interrupted = true;
    if (event.type === 'done') done = true;
    if (event.type === 'turn/completed') completed = true;
    opts.send(event);
  };
  try {
    opts.signal?.throwIfAborted();
    await execute({ ...opts, body: { ...opts.body, turnId }, send });
  } catch (error) {
    if (opts.signal?.aborted) {
      interrupted = true;
      send({ type: 'turn/interrupted', turnId });
    } else {
      failed = true;
      send({ type: 'error', error: safeErrorMessage(new Error(formatUserError(error)), '本轮处理失败，请稍后重试') });
    }
  } finally {
    rejectTurnApprovals(turnId);
    if (failed || interrupted || (opts.signal?.aborted && !completed)) {
      await updateTurnStatus(turnId, interrupted || (opts.signal?.aborted && !completed) ? 'interrupted' : 'failed', undefined,
        opts.body.threadId?.trim() || 'default').catch(() => undefined);
    }
    await flushItemQueue().catch(() => undefined);
    if (!done) send({ type: 'done' });
  }
}

export function createTurnStream(
  req: Request,
  body: TurnStartBody,
  run: (opts: RunAssistantTurnOptions) => Promise<void>,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const turnId = body.turnId?.trim() || newTurnId();
  if (activeTurnControllers.has(scopedKey(turnId))) {
    return jsonResponse({ success: false, error: '本轮请求正在运行，请勿重复提交' }, 409);
  }
  const controllerKey = scopedKey(turnId);
  const abortController = new AbortController();
  let finishRun!: () => void;
  const active: ActiveTurn = { workspaceId: requireWorkspaceId(), turnId, controller: abortController, threadId: body.threadId?.trim() || 'default',
    finished: new Promise<void>((resolve) => { finishRun = resolve; }) };
  const runSignal = AbortSignal.any([req.signal, abortController.signal, ...(signal ? [signal] : [])]);
  let closed = false;
  let terminalSeen = false;
  activeTurnControllers.set(scopedKey(turnId), active);
  const sseHeaders = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };

  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (payload: AssistantSSEEvent) => {
          if (['done', 'turn/completed', 'turn/interrupted', 'error'].includes(payload.type)) terminalSeen = true;
          if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        try {
          await run({ req, body: { ...body, turnId }, signal: runSignal, send });
        } finally {
          if (activeTurnControllers.get(controllerKey) === active) activeTurnControllers.delete(controllerKey);
          finishRun();
          if (!closed) { closed = true; controller.close(); }
        }
      },
      cancel() {
        closed = true;
        if (!terminalSeen) abortController.abort();
      },
    }),
    { headers: sseHeaders },
  );
}
