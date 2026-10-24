import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveGo, resolveGofmt } from './go-toolchain.mjs';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

function result(stdout: string, status = 0) {
  return { status, stdout, stderr: '' } as ReturnType<typeof spawnSync>;
}

beforeEach(() => {
  vi.mocked(spawnSync).mockReset();
  vi.stubEnv('GO_BIN', '/selected-sdk/go');
});
afterEach(() => vi.unstubAllEnvs());

describe('local Go toolchain selection', () => {
  it.each(['1.26.0', '1.26.9', '1.27.0', '2.0.0'])('accepts compatible stable Go %s', version => {
    vi.mocked(spawnSync).mockReturnValue(result(`go version go${version} linux/amd64\n`));
    expect(resolveGo()).toBe('/selected-sdk/go');
    expect(spawnSync).toHaveBeenCalledWith('/selected-sdk/go', ['version'], expect.objectContaining({
      env: expect.objectContaining({ GOTOOLCHAIN: 'local' }),
    }));
  });

  it.each(['1.25.9', '1.9.0', '1.26rc1', '1.27beta1', 'invalid'])('rejects incompatible or unstable Go %s without silently ignoring GO_BIN', version => {
    vi.mocked(spawnSync).mockReturnValue(result(`go version go${version} linux/amd64`));
    expect(() => resolveGo()).toThrow('GO_BIN');
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('continues searching when PATH selects an older SDK', () => {
    vi.stubEnv('GO_BIN', '');
    vi.mocked(spawnSync).mockReturnValueOnce(result('go version go1.25.9 linux/amd64'))
      .mockReturnValue(result('go version go1.26.9 linux/amd64'));
    expect(resolveGo()).toContain('.local');
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable compilers', () => {
    vi.mocked(spawnSync).mockReturnValue(result('', 1));
    expect(() => resolveGo()).toThrow('1.26.0');
  });

  it('finds gofmt in the selected GOROOT when Go comes from PATH', () => {
    vi.mocked(spawnSync).mockReturnValue(result('/sdk with spaces\n'));
    expect(resolveGofmt('go')).toBe(path.join('/sdk with spaces', 'bin', process.platform === 'win32' ? 'gofmt.exe' : 'gofmt'));
    expect(spawnSync).toHaveBeenCalledWith('go', ['env', 'GOROOT'], expect.objectContaining({
      env: expect.objectContaining({ GOTOOLCHAIN: 'local' }),
    }));
  });
});
