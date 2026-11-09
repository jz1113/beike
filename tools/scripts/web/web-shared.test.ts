import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { buildApiEnv, readDevApiDefaults } from './web-shared.mjs';

afterEach(() => vi.unstubAllEnvs());

it('loads development API defaults without overriding process or launcher settings', () => {
  const root = mkdtempSync(join(tmpdir(), 'beike-dev-env-'));
  try {
    expect(readDevApiDefaults(root, false)).toEqual({});
    writeFileSync(join(root, '.env'), [
      'AI_DRAWING_API_KEY="fixture key"',
      'AI_DRAWING_BASE_URL=https://example.invalid',
      'DATABASE_URL=file:other.db',
      'LOCAL_ACCESS_TOKEN=fixture-file-token',
      'PORT=12345',
    ].join('\n'));
    vi.stubEnv('AI_DRAWING_API_KEY', undefined);
    vi.stubEnv('AI_DRAWING_BASE_URL', 'https://process.invalid');
    const appDataDir = join(root, 'data');
    const defaults = readDevApiDefaults(root, false);
    expect(buildApiEnv({ apiPort: 3101, appDataDir, accessToken: 'fixture-launch-token', defaults })).toMatchObject({
      AI_DRAWING_API_KEY: 'fixture key',
      AI_DRAWING_BASE_URL: 'https://process.invalid',
      DATABASE_URL: `file:${join(appDataDir, 'azhuo.db')}`,
      LOCAL_ACCESS_TOKEN: 'fixture-launch-token',
      PORT: '3101',
    });
    expect(readDevApiDefaults(root, true)).toEqual({});
    expect(process.env.AI_DRAWING_API_KEY).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
