import { createHash } from 'node:crypto';
import { guardSubmission, readSubmissionReceipt } from './submissionGuard';
import { jsonResponse } from '../../core/http';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

type DepthKind = 'depth-image' | 'depth-video';
const localCredentials = { baseUrl: 'local-depth', apiKey: '' };

/** The receipt stores only the fingerprint and response, never the uploaded media. */
export function depthInputDigest(input: Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function guardDepthSubmission(
  req: Request,
  kind: DepthKind,
  operation: unknown,
  input: Record<string, unknown>,
  submit: () => Promise<Response>,
): Promise<Response> {
  const key = req.headers.get('x-idempotency-key')?.trim() || operation;
  if (key === undefined || key === null || key === '') return submit();
  if (typeof key !== 'string' || !key.trim() || key.length > 256) {
    return jsonResponse({ success: false, error: '任务标识不合法', submissionRejected: true }, 400);
  }
  const headers = new Headers(req.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('x-idempotency-key', key);
  headers.delete('content-length');
  const replay = new Request(req.url, {
    method: 'POST', headers,
    body: JSON.stringify({ prompt: kind, clientTaskId: key, ...input, storage: req.headers.get('x-storage-config') || '' }),
  });
  try {
    return await guardSubmission(replay, kind, localCredentials, async () => {
      try { return await submit(); } catch (error) {
        const failReason = formatUserError(error, '深度任务执行失败');
        const rejectedBeforeQueue = typeof error === 'object' && error !== null && 'submissionRejected' in error && error.submissionRejected === true;
        if (kind === 'depth-video' && !rejectedBeforeQueue) {
          return jsonResponse({ success: false, submissionUnknown: true, error: '深度视频提交结果待核对，请查询原任务' }, 503);
        }
        return jsonResponse({ success: false, status: 'FAILURE', submissionRejected: true, error: failReason, failReason }, 500);
      }
    });
  } catch {
    return jsonResponse({ success: false, submissionUnknown: true, error: '深度任务提交记录暂时无法核对，请查询原任务' }, 503);
  }
}

export async function readDepthSubmissionReceipt(req: Request, kind: DepthKind): Promise<Response> {
  const key = new URL(req.url).searchParams.get('taskKey');
  if (!key?.trim() || key.length > 256) return jsonResponse({ success: false, error: '任务标识无效' }, 400);
  try {
    return await readSubmissionReceipt(kind, localCredentials, key) || jsonResponse({
      status: 'QUERY_FAILED', retryable: true, error: '原深度任务提交结果待核对；不会自动重新提交',
    });
  } catch {
    return jsonResponse({ success: false, retryable: true, error: '原深度任务提交记录暂时无法查询' }, 503);
  }
}
