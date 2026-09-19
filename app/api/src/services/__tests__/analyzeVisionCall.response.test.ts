import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../gatewayCredentials', () => ({ getDefaultBaseUrl: () => 'https://main.example', getDefaultApiKey: () => 'test-key' }));
import { callVisionModel } from '../analyzeVisionCall';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const call = () => callVisionModel('gpt-5.6-luna', [], 'https://main.example/v1', 'test-key', ['other-model']);
const respond = (data: unknown) => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(data));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
};
describe('vision gateway responses', () => {
  it('uses the requested main gateway and reads text blocks', async () => {
    const fetcher = respond({ choices: [{ message: { content: [{ type: 'text', text: '正文' }] }, finish_reason: 'stop' }] });
    expect((await call()).rawText).toBe('正文');
    expect(fetcher.mock.calls[0][0]).toBe('https://main.example/v1/chat/completions');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).max_tokens).toBe(8192);
  });
  it.each([
    [{ choices: [{ message: { content: null, reasoning_content: 'private reasoning' }, finish_reason: 'length' }], usage: { completion_tokens: 1520 } }, '输出 token 额度已耗尽'],
    [{ choices: [{ message: { content: 'truncated' }, finish_reason: 'length' }] }, '分析结果为空或不完整'],
    [{ choices: [] }, '网关未返回可用正文'],
    [{ error: { message: 'provider failure' } }, '网关返回错误响应'],
    [{ choices: [{ message: { refusal: 'no' }, finish_reason: 'content_filter' }] }, '模型拒绝或内容过滤'],
  ])('reports an unusable success response without another billed attempt', async (data, reason) => {
    const fetcher = respond(data);
    await expect(call()).rejects.toThrow(reason);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('private reasoning');
  });
  it('keeps the timeout active while reading the response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    })));
    const result = expect(call()).rejects.toThrow('视觉模型响应超时');
    await vi.advanceTimersByTimeAsync(360_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});
it('preserves a discovered independent model ID instead of applying Comfly legacy aliases', async () => {
  const fetcher = respond({ choices: [{ message: { content: 'result' }, finish_reason: 'stop' }] });
  const result = await callVisionModel('gemini-3.1-pro-preview', [], 'https://second.example.com/endpoint', 'second-key', [], 4, true);
  expect(result.actualModel).toBe('gemini-3.1-pro-preview');
  expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('gemini-3.1-pro-preview');
  expect(fetcher.mock.calls[0][0]).toBe('https://second.example.com/endpoint/v1/chat/completions');
});
