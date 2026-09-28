import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveAppDataDir } from '../web/web-shared.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Resolve the same SQLite file that start-web uses, unless DATABASE_URL is explicit. */
export function resolveSqliteFile(fromArg) {
  if (fromArg) return path.resolve(fromArg);
  const configuredDataDir = process.env.AZHUO_DATA_DIR;
  if (typeof process.loadEnvFile === 'function') {
    const serviceHome = process.platform === 'linux' && fs.existsSync(path.join(homedir(), 'storage')) ? homedir() : null;
    const envFile = configuredDataDir
      ? path.join(configuredDataDir, '.env')
      : serviceHome ? path.join(serviceHome, '.env') : path.join(root, '.env');
    try { process.loadEnvFile(envFile); } catch { /* optional configuration */ }
  }
  const url = process.env.DATABASE_URL;
  if (url) {
    if (!url.startsWith('file:')) throw new Error(`仅支持 SQLite file: URL，当前为 ${url}`);
    const raw = url.slice('file:'.length);
    return path.isAbsolute(raw) ? raw : path.resolve(root, 'database', raw);
  }
  const appDataDir = process.env.AZHUO_DATA_DIR || resolveAppDataDir();
  const runtimeFile = path.join(appDataDir, 'azhuo.db');
  if (fs.existsSync(runtimeFile)) return runtimeFile;
  if (process.env.AZHUO_DATA_DIR) throw new Error(`指定的数据目录中未找到运行数据库：${runtimeFile}`);
  const developmentFile = path.join(root, 'database', 'dev.db');
  if (fs.existsSync(developmentFile)) return developmentFile;
  throw new Error(`未找到运行数据库：${runtimeFile}；请通过 DATABASE_URL 或文件参数指定`);
}
