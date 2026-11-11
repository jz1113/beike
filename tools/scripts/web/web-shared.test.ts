import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { buildApiEnv, depthEnvironmentPython, ensureAppDatabase, readDevApiDefaults, resolveDatabaseFile, resolveDepthPython } from './web-shared.mjs';

afterEach(() => vi.unstubAllEnvs());

it('uses the explicit process database for normal launch and keeps isolated development separate', () => {
  vi.stubEnv('DATABASE_URL', 'file:/temporary/custom.db');
  const options = { apiPort: 3101, appDataDir: '/temporary/app', accessToken: 'fixture-token' };
  expect(buildApiEnv(options).DATABASE_URL).toBe('file:/temporary/custom.db');
  expect(buildApiEnv({ ...options, isolated: true }).DATABASE_URL).toBe('file:/temporary/app/azhuo.db');
});

it('loads development API defaults without overriding process or launcher settings', () => {
  vi.stubEnv('DATABASE_URL', '');
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

it('prepares the selected database parent without creating or copying a database', () => {
  const root = mkdtempSync(join(tmpdir(), 'beike-database-path-'));
  try {
    const appDataDir = join(root, 'data');
    const databaseFile = join(root, 'custom-db', 'selected.db');
    vi.stubEnv('DATABASE_URL', `file:${databaseFile}`);
    expect(resolveDatabaseFile({ workspaceRoot: root, appDataDir })).toBe(databaseFile);
    ensureAppDatabase(root, appDataDir, databaseFile);
    expect(existsSync(join(root, 'custom-db'))).toBe(true);
    expect(existsSync(join(appDataDir, 'storage'))).toBe(true);
    expect(existsSync(databaseFile)).toBe(false);
    expect(existsSync(join(appDataDir, 'azhuo.db'))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('uses a managed depth environment on launch while preserving an explicit interpreter', () => {
  const root = mkdtempSync(join(tmpdir(), 'beike-depth-python-'));
  try {
    const python = depthEnvironmentPython(root);
    mkdirSync(join(python, '..'), { recursive: true });
    writeFileSync(python, 'fixture');
    expect(resolveDepthPython(root, {})).toBe(python);
    expect(resolveDepthPython(root, { DEPTH_VIDEO_PYTHON: '/fixture/custom-python' })).toBe('/fixture/custom-python');
    vi.stubEnv('DEPTH_VIDEO_PYTHON', '');
    expect(buildApiEnv({ apiPort: 3101, appDataDir: root, accessToken: 'fixture-token', isolated: true }).DEPTH_VIDEO_PYTHON).toBe(python);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
