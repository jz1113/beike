import { jsonResponse } from '../../core/http';
import { readJsonBody } from '../../core/validate';
import { parseJsonBody } from '../../core/validate';
import { turnStartBodySchema, turnApproveBodySchema, turnInterruptBodySchema } from '@beike/contracts/assistant';
import { createAssistantSSEStream, interruptActiveAssistantTurn } from '../../services/assistantAgent';
import { resolveApproval, rejectTurnApprovals } from '../../services/assistantApprovalStore';

export async function startTurn(req: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (parseErr: unknown) {
    const msg = parseErr instanceof Error ? parseErr.message : '内容格式异常';
    return jsonResponse({ success: false, error: `请求载荷解析失败: ${msg}` }, 400);
  }

  const parsed = parseJsonBody(body, turnStartBodySchema);
  if (!parsed.success) {
    return jsonResponse({ success: false, error: parsed.error }, 400);
  }

  return createAssistantSSEStream(req, parsed.data);
}

export async function approveTurn(req: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonResponse({ success: false, error: '无效 JSON' }, 400);
  }

  const parsed = parseJsonBody(body, turnApproveBodySchema);
  if (!parsed.success) {
    return jsonResponse({ success: false, error: parsed.error }, 400);
  }

  const { turnId, approvalId, decision } = parsed.data;
  const resolved = resolveApproval(`${turnId}_${approvalId}`, decision);
  if (!resolved) {
    return jsonResponse({ success: false, error: '审批请求不存在或已过期' }, 404);
  }

  return jsonResponse({ success: true, decision });
}

export async function interruptTurn(req: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonResponse({ success: false, error: '无效 JSON' }, 400);
  }

  const parsed = parseJsonBody(body, turnInterruptBodySchema);
  if (!parsed.success) {
    return jsonResponse({ success: false, error: parsed.error }, 400);
  }

  interruptActiveAssistantTurn(parsed.data.turnId);
  rejectTurnApprovals(parsed.data.turnId);
  return jsonResponse({ success: true });
}
