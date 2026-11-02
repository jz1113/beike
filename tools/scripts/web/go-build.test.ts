import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGoApi } from './go-build.mjs';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
vi.mock('../common/go-toolchain.mjs', () => ({ resolveGo: () => '/sdk/go' }));

function result(status: number, stderr = '') {
  return { status, stderr, stdout: '', error: undefined } as ReturnType<typeof spawnSync>;
}

beforeEach(() => {
  vi.mocked(spawnSync).mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  vi.stubEnv('GOPROXY', 'https://configured-proxy.example');
  vi.stubEnv('GONOPROXY', 'private.example');
  vi.stubEnv('GOSUMDB', 'sum.golang.org');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('API build with cached dependencies', () => {
  it('always invokes Go to detect changed sources while avoiding module network lookups', () => {
    vi.mocked(spawnSync).mockReturnValue(result(0));
    buildGoApi('/workspace', '/output/api');
    buildGoApi('/workspace', '/output/api');
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenCalledWith('/sdk/go', [
      'build', '-mod=readonly', '-o', '/output/api', './src/backend/cmd/api',
    ], expect.objectContaining({
      cwd: '/workspace',
      env: expect.objectContaining({ GOPROXY: 'off', GONOPROXY: 'none', GOSUMDB: 'sum.golang.org', GOTOOLCHAIN: 'local' }),
    }));
    expect(process.env.GOPROXY).toBe('https://configured-proxy.example');
    expect(process.env.GONOPROXY).toBe('private.example');
  });

  it.each(['module lookup disabled by GOPROXY=off', 'missing go.sum entry for module providing package example'])(
    'retries missing dependencies with the original settings: %s', diagnostic => {
      vi.mocked(spawnSync).mockReturnValueOnce(result(1, diagnostic)).mockReturnValueOnce(result(0));
      buildGoApi('/workspace', '/output/api');
      expect(spawnSync).toHaveBeenCalledTimes(2);
      expect(spawnSync).toHaveBeenLastCalledWith('/sdk/go', [
        'build', '-o', '/output/api', './src/backend/cmd/api',
      ], expect.objectContaining({
        stdio: 'inherit',
        env: expect.objectContaining({
          GOPROXY: 'https://configured-proxy.example', GONOPROXY: 'private.example', GOSUMDB: 'sum.golang.org',
        }),
      }));
    });

  it.each(['main.go: undefined: missing', 'verifying module: checksum mismatch'])(
    'surfaces errors without an unnecessary network retry: %s', diagnostic => {
      vi.mocked(spawnSync).mockReturnValue(result(1, diagnostic));
      expect(() => buildGoApi('/workspace', '/output/api')).toThrow('构建失败');
      expect(spawnSync).toHaveBeenCalledTimes(1);
      expect(process.stderr.write).toHaveBeenCalledWith(diagnostic);
    });

  it('fails when the network retry fails instead of launching a stale binary', () => {
    vi.mocked(spawnSync).mockReturnValueOnce(result(1, 'module lookup disabled by GOPROXY=off'))
      .mockReturnValueOnce(result(1));
    expect(() => buildGoApi('/workspace', '/output/api')).toThrow('构建失败');
  });

  it('reports a compiler that could not be started', () => {
    vi.mocked(spawnSync).mockReturnValue({ ...result(1), error: new Error('ENOENT') });
    expect(() => buildGoApi('/workspace', '/output/api')).toThrow('ENOENT');
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });
});
