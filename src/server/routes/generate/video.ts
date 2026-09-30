import { readJsonBody } from '../../core/validate';
import { jsonResponse } from '../../core/http';
import { guardSubmission, readSubmissionReceipt } from '../../services/tasks/submissionGuard';
import { withPersistedGenerationStatus } from '../../services/tasks/generationTerminalState';
import { recordPollTelemetry } from '../../services/assistant/agentTelemetry';
import { resolveCredentials } from '../../services/models/gatewayCredentials';
import { submitVideoOnce } from '../../services/generate/videoGeneration';
import { pollVideoOnce } from '../../services/generate/videoPoll';
import { extractStorageConfigFromRequest } from '@server/infrastructure/storage/storage';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { videoGenerationBodySchema } from '@shared/contracts/videoGeneration';

export async function POST(req: Request) {
  const startedAt = Date.now();
  let raw: unknown;
  try { raw = await readJsonBody(req); } catch { return jsonResponse({ success: false, error: '请求格式不正确' }, 400); }
  const parsed = videoGenerationBodySchema.safeParse(raw);
  if (!parsed.success) return jsonResponse({ success: false, error: parsed.error.issues[0]?.message || '视频参数不正确', retryable: false }, 400);
  const body = parsed.data;
  const replay = () => new Request(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(body) });
  try {
    const credentials = resolveCredentials(replay(), body);
    return await guardSubmission(replay(), 'video', credentials, async () => {
      const result = await submitVideoOnce(body, credentials, startedAt);
      return jsonResponse(result.body, result.status);
    });
  } catch {
    return jsonResponse({ success: false, error: '任务提交记录保存失败，请核对原任务状态', submissionUnknown: true, retryable: false }, 503);
  }
}

export async function GET(req: Request) {
  const lookup = new URL(req.url);
  const taskKey = lookup.searchParams.get('taskKey');
  if (!lookup.searchParams.get('taskId') && taskKey !== null) {
    if (!taskKey.trim() || taskKey.length > 256) return jsonResponse({ success: false, error: '任务标识无效' }, 400);
    try {
      const receipt = await readSubmissionReceipt('video', resolveCredentials(req), taskKey);
      return receipt || jsonResponse({ status: 'QUERY_FAILED', retryable: true, error: '原任务提交结果待核对，请稍后查询；不会自动重新提交' }, 200);
    } catch {
      return jsonResponse({ success: false, retryable: true, error: '原任务提交记录暂时无法核对，请稍后查询' }, 503);
    }
  }
  let provider: string | undefined;
  try {
    provider = new URL(resolveCredentials(req).baseUrl).hostname;
  } catch { /* ignore */ }
  return recordPollTelemetry('video-poll', req, () => withPersistedGenerationStatus(req, async () => {
    try {
      const result = await pollVideoOnce(
        new URL(req.url).searchParams.get('taskId'),
        resolveCredentials(req),
        () => extractStorageConfigFromRequest(req),
      );
      return jsonResponse(result.body, result.status);
    } catch (error) {
      return jsonResponse({ success: false, error: formatUserError(error, '查询视频任务状态失败') }, 500);
    }
  }), provider);
}
