import { jsonResponse } from '@server/core/http';
import { readJsonBody } from '@server/core/validate';
import { errorResponse } from '@server/core/errors';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { getDeconstructProgress } from '@server/services/deconstruct/progress';
import { processDeconstructRequest } from '@server/services/deconstruct/processRequest';

const activeDeconstructRequests = new Map<string, Promise<Response>>();

export function GET_PROGRESS(req: Request) {
  const taskId = new URL(req.url).searchParams.get('clientTaskId') || '';
  if (!taskId || taskId.length > 160) return jsonResponse({ error: '缺少有效的任务 ID' }, 400);
  return jsonResponse({ success: true, progress: getDeconstructProgress(taskId) });
}

// 向后兼容导出（供单元测试与其他调用方使用）
export {
  sanitizeJsonControlChars,
  repairSingleObjectJson,
  repairAndParseDeconstructJson,
  parseUnifiedFromResponse,
} from '../../../services/deconstruct/jsonHealer';
export {
  createVisionCallDiagnostics,
  noteModelAttempt,
  finalizeVisionDiagnostics,
  buildDeconstructFailureResponse,
  createVisionCallTracker,
  noteVisionCall,
  type VisionCallDiagnostics,
  type VisionCallTracker,
} from '../../../services/deconstruct/diagnostics';
export {
  resolveDeconstructConcurrency,
  resolveMaxInflight,
  noteRateLimitHit,
  noteRateLimitSuccess,
  getEffectiveConcurrency,
  parseRetryAfterMs,
  backoffWithJitter,
  sleep,
  isRateLimitResponse,
  isQuotaExhausted,
  RATE_LIMIT_BACKOFF_MS,
  MAX_NETWORK_ATTEMPTS,
} from '../../../services/deconstruct/concurrency';

export async function POST(req: Request) {
  let body: Record<string, any>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return errorResponse(error);
  }
  const clientTaskId = typeof body.clientTaskId === 'string' && body.clientTaskId.length <= 160
    ? body.clientTaskId
    : '';
  if (!clientTaskId) return processDeconstructRequest(req, body);
  const key = `${requireWorkspaceId()}:${clientTaskId}`;
  const existing = activeDeconstructRequests.get(key);
  if (existing) return (await existing).clone();
  const pending = processDeconstructRequest(req, body);
  activeDeconstructRequests.set(key, pending);
  try {
    return (await pending).clone();
  } finally {
    activeDeconstructRequests.delete(key);
  }
}
