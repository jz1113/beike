import { readJsonBody } from '../../core/validate';
import { jsonResponse } from '../../core/http';
import { guardSubmission } from '../../services/tasks/submissionGuard';
import { withPersistedGenerationStatus } from '../../services/tasks/generationTerminalState';
import { recordPollTelemetry } from '../../services/assistant/agentTelemetry';
import { resolveCredentials } from '../../services/models/gatewayCredentials';
import { submitVideoOnce } from '../../services/generate/videoGeneration';
import { pollVideoOnce } from '../../services/generate/videoPoll';
import { extractStorageConfigFromRequest } from '@server/infrastructure/storage/storage';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

export async function POST(req: Request) {
  const startedAt = Date.now();
  let body;
  try { body = await readJsonBody(req); } catch { return jsonResponse({ success: false, error: '请求格式不正确' }, 400); }
  const replay = () => new Request(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(body) });
  try {
    const credentials = resolveCredentials(replay(), body);
    return await guardSubmission(replay(), 'video', credentials, async () => {
      const result = await submitVideoOnce(body, credentials, startedAt);
      return jsonResponse(result.body, result.status);
    });
  } catch {
    return jsonResponse({ success: false, error: '任务提交记录保存失败，请核对原任务状态后重试', submissionUnknown: true }, 503);
  }
}

export async function GET(req: Request) {
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
