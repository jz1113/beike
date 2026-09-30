import { randomUUID } from 'node:crypto';
import type { TurnStartBody } from '@shared/contracts/assistant';
import type { AssistantTurn } from '@shared/domain/assistant/types';
import type { AssistantSSEEvent } from '@shared/domain/assistant/events';
import { assistantRequestFingerprint, type AssistantExecutionClaim } from '@server/repositories/assistantExecution';
import type { RunAssistantTurnOptions } from './assistantAgent';
import { createTurnStream, interruptActiveAssistantTurn, isAssistantTurnActive } from './assistantTurnStream';

interface ExecutionDependencies {
  claim: (id: string, threadId: string, fingerprint: string, model: string) => Promise<AssistantExecutionClaim>;
  snapshot: (id: string) => Promise<AssistantTurn | null>;
  run: (options: RunAssistantTurnOptions) => Promise<void>;
  settle: (id: string, status: 'interrupted') => Promise<void>;
}
const sseHeaders = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' };

/** One persisted claim owns execution; a duplicate can observe, never replace its runner. */
export function createAssistantExecutionService(dependencies: ExecutionDependencies) {
  return {
    interrupt: interruptActiveAssistantTurn,
    async start(req: Request, body: TurnStartBody, credentials: { baseUrl: string; apiKey: string }): Promise<Response> {
      const turnId = body.turnId?.trim() || `turn_${randomUUID()}`, threadId = body.threadId?.trim() || 'default';
      if (turnId.length > 255 || threadId.length > 255) return Response.json({ success: false, error: '会话或任务标识过长', retryable: false }, { status: 400 });
      const normalized = { ...body, turnId, threadId };
      let claim: AssistantExecutionClaim;
      try { claim = await dependencies.claim(turnId, threadId, assistantRequestFingerprint(normalized, credentials), body.model || ''); }
      catch { return Response.json({ success: false, turnId, error: '任务领取记录未确认，本轮未执行，请核对原任务', submissionUnknown: true, retryable: false }, { status: 503 }); }
      if (claim.outcome === 'conflict') return Response.json({ success: false, turnId, error: '同一任务标识不能用于不同的请求内容', retryable: false }, { status: 409 });
      if (claim.outcome === 'existing') {
        if (!['completed', 'failed', 'interrupted'].includes(claim.turn.status) && isAssistantTurnActive(turnId)) return Response.json({ success: false, turnId,
          error: '原任务正在执行或结果待核实，请查询原任务', submissionUnknown: true, retryable: false,
          snapshotUrl: `/api/assistant/turns/${encodeURIComponent(turnId)}/snapshot` }, { status: 409 });
        let snapshot: AssistantTurn | null;
        try { snapshot = await dependencies.snapshot(turnId); } catch { snapshot = null; }
        if (!snapshot) return Response.json({ success: false, turnId, error: '原任务快照暂时无法读取，本轮未重新执行', retryable: false }, { status: 503 });
        const events: AssistantSSEEvent[] = [{ type: 'turn/snapshot', turnId, threadId, snapshot }];
        if (snapshot.status === 'completed') events.push({ type: 'turn/completed', turnId });
        else events.push({ type: 'error', error: snapshot.status === 'interrupted' ? '原任务已中断，已有结果已保留' : '原任务未完成，已有结果已保留' });
        events.push({ type: 'done' });
        return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: sseHeaders });
      }
      return createTurnStream(req, normalized, async options => {
        try { await dependencies.run(options); }
        finally {
          // Preserve an unconfirmed receipt rather than claiming a known failure.
          if (options.signal?.aborted) await dependencies.settle(turnId, 'interrupted')
            .catch(error => console.error('[Assistant] terminal state save failed', error));
        }
      });
    },
  };
}
