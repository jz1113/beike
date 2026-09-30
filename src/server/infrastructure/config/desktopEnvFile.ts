import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** 解析 .env 为键值表（保留未知键） */
export function parseEnvFile(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      val.length >= 2 &&
      ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
    ) {
      val = val.slice(1, -1);
    }
    if (key) map.set(key, val);
  }
  return map;
}

/**
 * 读取 .env 文件并**覆盖**同名 process.env 键（用于桌面数据目录最新用户配置）。
 * 文件不存在或解析失败时静默忽略。
 */
export function applyEnvFileToProcess(envPath: string): void {
  try {
    if (!fs.existsSync(envPath)) return;
    const entries = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
    for (const [key, val] of entries) {
      process.env[key] = val;
    }
  } catch {
    /* 环境文件解析失败时静默忽略 */
  }
}

/**
 * 读取 .env 文件并**仅补充**尚未设置的 process.env 键（不覆盖已有值）。
 * 文件不存在或解析失败时静默忽略。
 */
export function supplementEnvFromFile(envPath: string): void {
  try {
    if (!fs.existsSync(envPath)) return;
    const entries = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
    for (const [key, val] of entries) {
      if (!process.env[key] && val) {
        process.env[key] = val;
      }
    }
  } catch {
    /* 环境文件解析失败时静默忽略 */
  }
}

/** 合并写入 .env（不删除已有其它键） */
export function upsertEnvFile(envPath: string, updates: Record<string, string>): void {
  const dir = path.dirname(envPath);
  fs.mkdirSync(dir, { recursive: true });

  let map = new Map<string, string>();
  if (fs.existsSync(envPath)) {
    map = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
  }
  for (const [k, v] of Object.entries(updates)) {
    if (v === '' || v === undefined) map.delete(k);
    else map.set(k, v);
  }

  const lines = [
    '# 贝壳云图 · 桌面端 API 配置（由应用自动写入）',
    ...Array.from(map.entries()).map(([k, v]) => `${k}=${v}`),
    '',
  ];
  const temporaryPath = path.join(dir, `.env-${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, lines.join('\n'), 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, envPath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}
