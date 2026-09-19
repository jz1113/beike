import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './fetch';
afterEach(() => vi.unstubAllGlobals());
const request = (body: Record<string, unknown>) => new Request('http://localhost/api/system/models/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-custom-api-key': 'MAIN-KEY' }, body: JSON.stringify({ strict: true, baseUrl: 'https://second.example.com/endpoint/v1/', apiKey: 'SECOND-KEY', ...body }) });
it('discovers models using exactly the second gateway URL and credential', async () => {
  const fetch = vi.fn(async () => Response.json({ data: [{ id: 'gpt-5.6-luna' }, { id: 'openai/gpt-image-2' }] }));
  vi.stubGlobal('fetch', fetch);
  const response = await POST(request({}));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.models.map((m: { id: string }) => m.id)).toEqual(['gpt-5.6-luna', 'gpt-image-2']);
  expect(fetch).toHaveBeenCalledWith('https://second.example.com/endpoint/v1/models', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer SECOND-KEY' }) }));
});
it.each([401, 403, 404, 500])('does not pass recommended models off as discovered models on HTTP %s', async status => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: 'gateway error' } }, { status })));
  const response = await POST(request({}));
  expect(response.ok).toBe(false);
  expect(await response.json()).toMatchObject({ success: false, models: [] });
});
it('rejects missing independent key instead of using the main header credential', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const response = await POST(request({ apiKey: '' }));
  expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled();
});
it('reports empty catalogs rather than supplying unrelated model IDs', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [] })));
  expect(await (await POST(request({}))).json()).toMatchObject({ success: false, models: [] });
});
