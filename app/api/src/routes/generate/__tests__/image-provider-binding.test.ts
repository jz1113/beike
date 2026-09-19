import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../../services/submissionGuard', () => ({ guardSubmission: (_req: Request, _kind: string, _creds: unknown, submit: () => Promise<Response>) => submit() }));
vi.mock('../../../services/gatewayCredentials', () => ({ resolveCredentials: (_req: Request, body: { customBaseUrl: string }) => ({ baseUrl: body.customBaseUrl, apiKey: 'test-only' }), buildImageSubmitCandidates: vi.fn() }));
import { POST } from '../image';
afterEach(() => vi.unstubAllGlobals());
it.each([
  ['openai/gpt-image-2', 'https://ai.comfly.org'],
  ['gpt-image-2', 'https://api.gapnet.ai/endpoint'],
])('rejects %s sent to %s before any upstream request', async (model, customBaseUrl) => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const response = await POST(new Request('http://localhost/api/generate/image', { method: 'POST', body: JSON.stringify({ prompt: 'local validation', model, customBaseUrl }) }));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain('模型与接口不匹配');
  expect(fetch).not.toHaveBeenCalled();
});
