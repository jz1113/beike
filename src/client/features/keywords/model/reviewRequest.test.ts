import { describe, expect, it } from 'vitest';
import { requestReviewBatch, type ReviewRequestError } from './reviewRequest';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function capture(status: number, body: unknown): Promise<ReviewRequestError> {
  try {
    await requestReviewBatch('{}', new AbortController().signal, 'keyword-key', {
      attemptId: 'attempt-1',
      fetcher: async () => jsonResponse(status, body),
    });
  } catch (error) {
    return error as ReviewRequestError;
  }
  throw new Error('expected the review request to fail');
}

describe('requestReviewBatch', () => {
  it('stops on server receipt-storage failure before starting another paid request', async () => {
    const error = await capture(503, { success: false, code: 'local_progress_unavailable', error: '服务器无法保存审核提交凭据' });
    expect(error.fatalLocal).toBe(true);
    expect(error.outcomeUncertain).toBeUndefined();
    expect(error.rateLimited).toBeUndefined();
    expect(error.gatewayRetryable).toBeUndefined();
  });
  it.each([400, 401, 403])('retries upstream account verification on HTTP %s', async (status) => {
    const error = await capture(status, {
      success: false, code: 'upstream_api_error',
      error: '模型网关请求失败，请稍后重试。接口原因：Verify your account to continue.',
    });
    expect(error.gatewayRetryable).toBe(true);
    expect(error.fatalConfig).toBeUndefined();
    expect(error.outcomeUncertain).toBeUndefined();
  });

  it.each([400, 401, 402, 403, 404, 409, 422])('still stops for configuration and credential errors on HTTP %s', async (status) => {
    const error = await capture(status, { success: false, code: 'upstream_api_error', error: 'API Key 无效或请求配置错误' });
    expect(error.fatalConfig).toBe(true);
    expect(error.gatewayRetryable).toBeUndefined();
  });

  it('does not treat local authentication or billed verification failures as unbilled gateway retries', async () => {
    const local = await capture(403, { success: false, error: 'Verify your account to continue.' });
    const billed = await capture(403, {
      success: false, code: 'upstream_api_error', error: 'Verify your account to continue.',
      usage: { total_tokens: 10 },
    });
    expect(local.gatewayRetryable).toBeUndefined();
    expect(local.fatalConfig).toBe(true);
    expect(billed.gatewayRetryable).toBeUndefined();
  });

  it('retries an unbilled gateway 503 instead of quarantining it', async () => {
    const error = await capture(503, { success: false, error: '账本暂不可用', code: 'upstream_api_error' });
    expect(error.rateLimited).toBe(true);
    expect(error.outcomeUncertain).toBeUndefined();
  });

  it('keeps a billed gateway failure out of the free retry path', async () => {
    const error = await capture(503, { success: false, error: '已计费', code: 'upstream_api_error', usage: { total_tokens: 10 } });
    expect(error.rateLimited).toBeUndefined();
    expect(error.gatewayRetryable).toBeUndefined();
    expect(error.outcomeUncertain).toBe(true);
  });

  it.each([500, 502])('retries an unbilled gateway %s instead of quarantining it', async (status) => {
    const error = await capture(status, { success: false, error: '模型网关请求失败，请稍后重试', code: 'upstream_api_error' });
    expect(error.gatewayRetryable).toBe(true);
    expect(error.gatewayTimeout).toBeUndefined();
    expect(error.outcomeUncertain).toBeUndefined();
    expect(error.rateLimited).toBeUndefined();
  });

  it.each([504, 524])('marks an unbilled gateway %s as a timeout instead of quarantining it', async (status) => {
    const error = await capture(status, { success: false, error: '模型网关在约 120 秒切断了响应，请减少每批词数后重试', code: 'upstream_api_error' });
    expect(error.gatewayTimeout).toBe(true);
    expect(error.gatewayRetryable).toBe(true);
    expect(error.outcomeUncertain).toBeUndefined();
    expect(error.rateLimited).toBeUndefined();
  });

  it('keeps a billed gateway timeout out of the split retry path', async () => {
    const error = await capture(524, { success: false, error: '已计费', code: 'upstream_api_error', usage: { total_tokens: 10 } });
    expect(error.gatewayTimeout).toBeUndefined();
    expect(error.gatewayRetryable).toBeUndefined();
    expect(error.outcomeUncertain).toBe(true);
  });

  it('keeps a dropped receipt quarantined', async () => {
    const error = await capture(409, { success: false, error: '该任务正在提交或提交结果待核对', submissionUnknown: true });
    expect(error.outcomeUncertain).toBe(true);
    expect(error.gatewayRetryable).toBeUndefined();
  });

  it.each([502, 503, 504, 524])('keeps an explicitly unknown HTTP %s out of every new-task retry path', async (status) => {
    const error = await capture(status, { success: false, error: '模型响应传输异常', submissionUnknown: true });
    expect(error.outcomeUncertain).toBe(true);
    expect(error.gatewayRetryable).toBeUndefined();
    expect(error.gatewayTimeout).toBeUndefined();
    expect(error.rateLimited).toBeUndefined();
    expect(error.fatalConfig).toBeUndefined();
  });

  it('still repairs invalid model output instead of treating it as a gateway retry', async () => {
    const error = await capture(502, { success: false, error: '输出被截断', code: 'model_output_invalid' });
    expect(error.modelOutputInvalid).toBe(true);
    expect(error.gatewayRetryable).toBeUndefined();
    expect(error.outcomeUncertain).toBeUndefined();
  });
});
