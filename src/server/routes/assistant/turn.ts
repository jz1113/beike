import { jsonResponse } from '../../core/http';
import { parseJsonBody } from '../../core/validate';
import { turnStartBodySchema, turnApproveBodySchema, turnInterruptBodySchema } from '@shared/contracts/assistant';
import { startAssistantTurn, interruptActiveAssistantTurn } from '../../services/assistant/assistantStart';
import { readResponseBodyLimited } from '../../core/readBodyLimited';
import { resolveApproval, rejectTurnApprovals } from '../../services/assistant/assistantApprovalStore';

export async function startTurn(req: Request) {
  let body: unknown;
  try {
    const read = await readResponseBodyLimited(new Response(req.body, { headers: req.headers }), 32_000_000, req.signal);
    if (!read.ok) return jsonResponse({ success: false, error: read.reason === 'too_large' ? '请求附件过大，请减少附件后重试' : '请求内容为空' }, read.reason === 'too_large' ? 413 : 400);
    body = JSON.parse(read.buffer.toString('utf8'));
  } catch {
    return jsonResponse({ success: false, error: '请求内容格式异常，请检查消息和附件后重试' }, 400);
  }

  const parsed = parseJsonBody(body, turnStartBodySchema);
  if (!parsed.success) {
    return jsonResponse({ success: false, error: parsed.error }, 400);
  }

  return startAssistantTurn(req, parsed.data);
}

export async function approveTurn(req: Request) {
  let body: unknown;
  try {
    const read = await readResponseBodyLimited(new Response(req.body, { headers: req.headers }), 4096, req.signal);
    if (!read.ok) return jsonResponse({ success: false, error: '审批内容过大或为空' }, read.reason === 'too_large' ? 413 : 400);
    body = JSON.parse(read.buffer.toString('utf8'));
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
    const read = await readResponseBodyLimited(new Response(req.body, { headers: req.headers }), 4096, req.signal);
    if (!read.ok) return jsonResponse({ success: false, error: '中断请求内容过大或为空' }, read.reason === 'too_large' ? 413 : 400);
    body = JSON.parse(read.buffer.toString('utf8'));
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
