import type { TurnStartBody } from '@shared/contracts/assistant';
import { resolveGatewayCreds } from '@shared/domain/models/gatewayCreds';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { assistantExecutionRepository } from '@server/repositories/assistantExecution';
import { readAssistantSnapshot } from '@server/repositories/assistantSnapshots';
import { getDefaultApiKey, getDefaultBaseUrl } from '../models/gatewayCredentials';
import { createAssistantExecutionService } from './assistantExecution';
import { runAssistantTurn } from './assistantAgent';
import { getEffectiveAssistantTurnStatus } from './assistantTurnStream';

const execution = createAssistantExecutionService({
  claim: assistantExecutionRepository.claim, snapshot: id => readAssistantSnapshot(id, getEffectiveAssistantTurnStatus),
  run: runAssistantTurn, settle: assistantExecutionRepository.settle });
export const interruptActiveAssistantTurn = execution.interrupt;
export async function startAssistantTurn(req: Request, body: TurnStartBody): Promise<Response> {
  try {
    const credentials = resolveGatewayCreds(req, { model: body.model ?? undefined, customBaseUrl: body.customBaseUrl ?? undefined, customApiKey: body.customApiKey ?? undefined },
      { baseUrl: getDefaultBaseUrl(), apiKey: getDefaultApiKey() });
    return execution.start(req, body, credentials);
  } catch (error) {
    return Response.json({ success: false, error: formatUserError(error, '原任务状态无法核对，本轮未执行'), retryable: false }, { status: 400 });
  }
}
