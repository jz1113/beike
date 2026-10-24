import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveAppDataDir } from '../web/web-shared.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Explicit paths/URLs override the app data directory; never guess a legacy database. */
export function resolveSqliteFile(fromArg) {
  if (fromArg) return path.resolve(fromArg);
  const configuredDataDir = process.env.AZHUO_DATA_DIR;
  if (typeof process.loadEnvFile === 'function') {
    const serviceHome = process.platform === 'linux' && fs.existsSync(path.join(homedir(), 'storage')) ? homedir() : null;
    const envFile = configuredDataDir
      ? path.resolve(root, configuredDataDir, '.env')
      : serviceHome ? path.join(serviceHome, '.env') : null;
    if (envFile) {
      try { process.loadEnvFile(envFile); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    if (!url.startsWith('file:')) throw new Error('仅支持 SQLite file: URL');
    let raw = url.slice('file:'.length);
    if (url.startsWith('file://')) {
      const parsed = new URL(url);
      raw = decodeURIComponent(parsed.pathname);
      if (parsed.hostname && parsed.hostname !== 'localhost') raw = `//${parsed.hostname}${raw}`;
      if (/^\/[A-Za-z]:/.test(raw)) raw = raw.slice(1);
    }
    if (!raw) throw new Error('DATABASE_URL 缺少 SQLite 文件路径');
    return path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)
      ? path.normalize(raw)
      : path.resolve(root, raw);
  }
  const appDataDir = process.env.AZHUO_DATA_DIR || resolveAppDataDir();
  return path.resolve(root, appDataDir, 'azhuo.db');
}
