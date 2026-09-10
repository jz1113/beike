import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@beike/shared/prisma', () => ({ prisma: {} }));
vi.mock('@beike/shared/latencyAudit', () => ({ logLatencyAudit: vi.fn() }));
vi.mock('../poll', () => ({}));
import { dispatchSubmitCandidates } from '../submit';
import { buildImageRequest } from '@beike/shared/modelAdapters';

const adapted = buildImageRequest({ model: 'gpt-image-2.5-flare', prompt: 'test', size: '3:4', quality: 'high', plainMode: true });
const options = { submitCandidates: adapted.endpoints('https://gateway.test').submit, adapted, apiKey: 'test-only', payloadJson: JSON.stringify(adapted.payload), editsImageUrls: [], identityLockedSlots: null, baseUrl: 'https://gateway.test', model: 'gpt-image-2.5-flare', parseMs: 0, convertMs: 0, imageCount: 0, convertCacheHits: 0, t0: Date.now() };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('actual POST keeps selected model and accepts documented async task envelope', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ code: 'success', data: { task_id: 'task-123' } })));
  vi.stubGlobal('fetch', fetch);
  const result = await dispatchSubmitCandidates(options);
  expect(result.taskId).toBe('task-123');
  expect(fetch).toHaveBeenCalledTimes(1);
  const request = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(request[0]).toContain('/v1/images/generations?async=true');
  expect(JSON.parse(String(request[1].body)).model).toBe('gpt-image-2.5-flare');
});
it.each([429, 500, 502, 200])('does not resubmit after uncertain or terminal HTTP %s', async status => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'upstream error' } }), { status }));
  vi.stubGlobal('fetch', fetch);
  await expect(dispatchSubmitCandidates(options)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('network timeout does not create another POST', async () => {
  const fetch = vi.fn(async () => { throw new DOMException('timeout', 'TimeoutError'); });
  vi.stubGlobal('fetch', fetch);
  await expect(dispatchSubmitCandidates(options)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('explicit unsupported route may use next endpoint without changing model', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 404 })).mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'task-2' })));
  vi.stubGlobal('fetch', fetch);
  expect((await dispatchSubmitCandidates(options)).taskId).toBe('task-2');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[1][1].body).model).toBe('gpt-image-2.5-flare');
});

it.each(['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'])('POST %s sends a valid 4K portrait pixel count', async model => {
  const request = buildImageRequest({ model, prompt: 'test', size: '2880x3840', quality: 'high', plainMode: true });
  const fetch = vi.fn(async () => new Response(JSON.stringify({ task_id: 'validated-task' })));
  vi.stubGlobal('fetch', fetch);
  await dispatchSubmitCandidates({ ...options, model, adapted: request, payloadJson: JSON.stringify(request.payload) });
  const call = fetch.mock.calls[0] as unknown as [string, RequestInit];
  const body = JSON.parse(String(call[1].body));
  expect(body.model).toBe(model);
  const [w, h] = body.size.split('x').map(Number);
  expect(w * h).toBeLessThanOrEqual(8_294_400);
  expect(w * h).toBeGreaterThanOrEqual(655_360);
});
