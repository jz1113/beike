import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { apiCors } from './cors';

const app = new Hono();
app.use('*', apiCors);
app.post('/api/generate/image', c => c.json({ success: true }));

describe('API cross-origin policy', () => {
  it.each(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'])('allows %s and image gateway preflight', async origin => {
    const response = await app.request('/api/generate/image', {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-image-protocol,x-app-token' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-headers')).toContain('x-image-protocol');
  });
  it.each(['https://tauri.localhost', 'http://tauri.localhost', 'tauri://localhost'])('allows desktop shell origin %s', async origin => {
    const response = await app.request('/api/generate/image', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  });
  it.each(['https://tauri.attacker.com', 'https://example.com', 'null'])('rejects %s', async origin => {
    const response = await app.request('/api/generate/image', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });
});
