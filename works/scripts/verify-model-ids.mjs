#!/usr/bin/env node
/**
 * 用本地网关 Key 拉取 /v1/models，对照白名单：缺 id / 同族未收录。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function readEnvKey(filePath, key) {
  if (!fs.existsSync(filePath)) return '';
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.startsWith(`${key}=`)) continue;
    let value = trimmed.slice(key.length + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return '';
}

loadEnvFile(path.join(workspaceRoot, '.env'));
loadEnvFile(path.join(workspaceRoot, '.env.production'));

const catalogSrc = fs.readFileSync(path.join(workspaceRoot, 'packages/domain/src/modelCatalog.ts'), 'utf8');
const approvedIds = [...catalogSrc.matchAll(/^\s+id: '([^']+)',$/gm)].map((m) => m[1]);

const baseUrl = (process.env.AI_DRAWING_BASE_URL || process.env.AI_BASE_URL || 'https://ai.comfly.org')
  .replace(/\/+$/, '')
  .replace(/\/v1$/i, '');
const candidateKeys = [
  process.env.AI_DRAWING_API_KEY || process.env.AI_API_KEY || '',
  readEnvKey(path.join(os.homedir(), 'Library/Application Support/com.azhuo.workbench/.env'), 'AI_DRAWING_API_KEY'),
].filter(Boolean);

const uniqueKeys = [...new Set(candidateKeys)];
if (uniqueKeys.length === 0) {
  console.error('缺少 AI_DRAWING_API_KEY，无法核验网关模型。');
  process.exit(2);
}

let payload = null;
let lastError = '';
for (const apiKey of uniqueKeys) {
  const res = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (res.ok) {
    payload = await res.json();
    break;
  }
  lastError = `网关 ${res.status} ${await res.text()}`;
}
if (!payload) {
  console.error(lastError || '网关拉取失败');
  process.exit(1);
}
const raw = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
const gatewayIds = raw.map((item) => (typeof item === 'string' ? item : item.id || item.name || '')).filter(Boolean);
const gatewayLower = new Set(gatewayIds.map((id) => id.toLowerCase()));
const canonical = (id) => {
  const slash = id.lastIndexOf('/');
  return (slash >= 0 ? id.slice(slash + 1) : id).toLowerCase();
};
const gatewayCanonical = new Set([...gatewayLower].map(canonical));

const missing = approvedIds.filter((id) => !gatewayCanonical.has(id.toLowerCase()));
const extraByFamily = gatewayIds.filter((id) => {
  const c = canonical(id);
  if (approvedIds.some((a) => a.toLowerCase() === c)) return false;
  return approvedIds.some((a) => {
    const stem = a.toLowerCase().split(/[-_.]/).slice(0, 2).join('-');
    return c.includes(stem) || stem.includes(c.slice(0, 8));
  });
});

console.log(`网关 ${baseUrl} 返回 ${gatewayIds.length} 个模型，白名单 ${approvedIds.length} 个`);
console.log('\n白名单中网关不存在：');
if (missing.length === 0) console.log('  (无)');
else missing.forEach((id) => console.log(`  - ${id}`));
console.log('\n网关存在、同族但不在白名单：');
if (extraByFamily.length === 0) console.log('  (无)');
else extraByFamily.slice(0, 80).forEach((id) => console.log(`  - ${id}`));

const report = {
  fetchedAt: new Date().toISOString(),
  baseUrl,
  approved: approvedIds.length,
  gateway: gatewayIds.length,
  missing,
  extraByFamily: extraByFamily.slice(0, 120),
};
fs.writeFileSync(
  path.join(workspaceRoot, 'docs/vendors/官方接口/gateway-id-audit.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
if (missing.length) process.exitCode = 1;
