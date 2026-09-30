import { gatewayFetch } from './http';
import { canTryAnotherSubmissionEndpoint } from './submissionPolicy';

interface SubmissionTiming { gatewayMs: number; endpointAttempts: number; usedSubmitUrl: string; upstreamStatus?: number }
export type VideoSubmissionResult = SubmissionTiming & (
  | { outcome: 'accepted'; taskId: string }
  | { outcome: 'rejected'; error: string }
  | { outcome: 'unknown'; error: string; taskId?: string }
);
export interface VideoSubmissionCommand {
  endpoints: string[]; apiKey: string; payloadJson: string;
  headers?: Record<string, string>;
  readTaskId: (value: unknown) => string | null;
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
function upstreamMessage(value: unknown, status: number): string {
  const data = record(value), error = record(data.error);
  const message = record(data.output).message || error.message || error.details || data.error || data.message || data.fail_reason;
  return typeof message === 'string' ? message : `HTTP ${status}`;
}

/** A POST with an uncertain result must never advance to a second endpoint. */
export async function submitVideoToGateway(command: VideoSubmissionCommand, transport: typeof gatewayFetch = gatewayFetch): Promise<VideoSubmissionResult> {
  const startedAt = Date.now();
  let endpointAttempts = 0, usedSubmitUrl = '', upstreamStatus: number | undefined;
  const timing = () => ({ gatewayMs: Date.now() - startedAt, endpointAttempts, usedSubmitUrl, upstreamStatus });
  let error = '视频接口未提供可用提交端点';
  for (const endpoint of command.endpoints) {
    usedSubmitUrl = endpoint;
    endpointAttempts++;
    try {
      const response = await transport(endpoint, { method: 'POST', body: command.payloadJson,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${command.apiKey}`, ...command.headers,
          ...(/\/video-generation\/|\/qwen\//.test(endpoint) ? { 'X-DashScope-Async': 'enable' } : {}) },
        signal: AbortSignal.timeout(endpointAttempts === 1 ? 60_000 : 20_000) });
      upstreamStatus = response.status;
      const data: unknown = await response.json().catch(() => null);
      const taskId = command.readTaskId(data);
      if (response.ok && taskId) return { outcome: 'accepted', taskId, ...timing() };
      error = upstreamMessage(data, response.status);
      if (response.ok || response.status >= 500) return { outcome: 'unknown', error, ...(taskId ? { taskId } : {}), ...timing() };
      if (!canTryAnotherSubmissionEndpoint(response.status)) return { outcome: 'rejected', error, ...timing() };
    } catch {
      return { outcome: 'unknown', error: '视频提交响应未确认', ...timing() };
    }
  }
  return { outcome: 'rejected', error, ...timing() };
}
