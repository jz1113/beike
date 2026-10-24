import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAppDataDir } from '../web/web-shared.mjs';
import { resolveSqliteFile } from './sqlite-path.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('AZHUO_DATA_DIR', '');
  vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('maintenance database selection', () => {
  it('defaults to the running app data directory without loading legacy root .env', () => {
    expect(resolveSqliteFile()).toBe(path.join(resolveAppDataDir(), 'azhuo.db'));
    expect(process.loadEnvFile).not.toHaveBeenCalled();
  });

  it('lets a file argument override environment settings', () => {
    vi.stubEnv('DATABASE_URL', 'unsupported://example');
    vi.stubEnv('AZHUO_DATA_DIR', '/other');
    expect(resolveSqliteFile('database/dev.db')).toBe(path.resolve('database/dev.db'));
    expect(process.loadEnvFile).not.toHaveBeenCalled();
  });

  it('resolves relative file URLs from the same root as Go', () => {
    vi.stubEnv('DATABASE_URL', 'file:./dev.db');
    expect(resolveSqliteFile()).toBe(path.join(root, 'dev.db'));
  });

  it('decodes file URIs containing spaces and Chinese characters', () => {
    const file = path.join(tmpdir(), '贝壳 数据', 'azhuo.db');
    vi.stubEnv('DATABASE_URL', pathToFileURL(file).href);
    expect(resolveSqliteFile()).toBe(file);
  });

  it('preserves native Windows drive paths instead of adding the repository', () => {
    const file = 'C:\\Users\\Example\\AppData\\azhuo.db';
    vi.stubEnv('DATABASE_URL', `file:${file}`);
    expect(resolveSqliteFile()).toBe(path.normalize(file));
  });

  it('supports Windows file URIs like the Go resolver', () => {
    vi.stubEnv('DATABASE_URL', 'file:///C:/data/azhuo.db');
    expect(resolveSqliteFile()).toBe(path.normalize('C:/data/azhuo.db'));
  });

  it('loads the configured data directory environment and allows initializing a new database', () => {
    const directory = path.join(tmpdir(), 'beike-new-data');
    vi.stubEnv('AZHUO_DATA_DIR', directory);
    expect(resolveSqliteFile()).toBe(path.join(directory, 'azhuo.db'));
    expect(process.loadEnvFile).toHaveBeenCalledWith(path.join(directory, '.env'));
  });

  it('honors DATABASE_URL from the data directory environment', () => {
    vi.stubEnv('AZHUO_DATA_DIR', path.join(tmpdir(), 'beike-data'));
    const file = path.join(tmpdir(), 'configured.db');
    vi.mocked(process.loadEnvFile).mockImplementation(() => {
      process.env.DATABASE_URL = pathToFileURL(file).href;
    });
    expect(resolveSqliteFile()).toBe(file);
  });

  it('tolerates missing optional configuration but reports unreadable configuration', () => {
    vi.stubEnv('AZHUO_DATA_DIR', path.join(tmpdir(), 'beike-data'));
    vi.mocked(process.loadEnvFile).mockImplementation(() => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    });
    expect(resolveSqliteFile()).toBe(path.join(tmpdir(), 'beike-data', 'azhuo.db'));
    vi.mocked(process.loadEnvFile).mockImplementation(() => {
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    });
    expect(() => resolveSqliteFile()).toThrow('denied');
  });

  it.each(['file:', 'https://example.invalid/database'])('rejects invalid database setting %s', (value) => {
    vi.stubEnv('DATABASE_URL', value);
    expect(() => resolveSqliteFile()).toThrow();
  });
});
