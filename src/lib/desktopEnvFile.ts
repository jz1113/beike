import fs from 'node:fs';
import path from 'node:path';

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
  fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
}
