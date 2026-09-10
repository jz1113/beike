import { expect, it, vi } from 'vitest';
import { checkMediaModelConnection } from './modelConnection';
it.each(['gpt-image-2.5-flare', 'veo3.1-pro'])('checks %s without posting a generation task', async model => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: model }] })));
  const result = await checkMediaModelConnection('https://gateway.test/v1/', 'test-only', model, fetcher);
  expect(result).toMatchObject({ success: true, modelVisible: true, testedGeneration: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('https://gateway.test/v1/models');
  expect(fetcher.mock.calls[0][1].method).toBe('GET');
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body');
});
it('distinguishes catalogue visibility from generation availability', async () => {
  const result = await checkMediaModelConnection('https://gateway.test', 'test', 'custom', vi.fn().mockResolvedValue(new Response('{"data":[]}')));
  expect(result).toMatchObject({ success: true, modelVisible: false, testedGeneration: false });
  expect(result.message).toContain('尚未确认');
});
it.each([401,429,500])('does not treat HTTP %s as success or expose provider credentials', async status => {
  const result = await checkMediaModelConnection('https://gateway.test', 'secret', 'custom', vi.fn().mockResolvedValue(new Response('secret', { status })));
  expect(result.success).toBe(false);
  expect(JSON.stringify(result)).not.toContain('secret');
});
it('rejects malformed catalogue response', async () => {
  expect((await checkMediaModelConnection('https://gateway.test', 'test', 'custom', vi.fn().mockResolvedValue(new Response('{}')))).success).toBe(false);
});
