import { afterEach, expect, it, vi } from 'vitest';
import { GET } from './health';
afterEach(() => vi.unstubAllEnvs());
it('never exposes a desktop credential through public health probes', async () => {
  vi.stubEnv('DESKTOP_SHELL', '1'); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('LOCAL_ACCESS_TOKEN', 'secret-health');
  expect((await (await GET(new Request('http://localhost/api/health'))).json()).desktopToken).toBe('');
  const authenticated = await (await GET(new Request('http://localhost/api/health', { headers: { 'x-app-token': 'secret-health' } }))).json();
  expect(authenticated.desktopToken).toBe('secret-health');
  expect(authenticated.mediaSession.sig).toBeTruthy();
});
