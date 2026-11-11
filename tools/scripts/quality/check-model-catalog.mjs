#!/usr/bin/env node
/**
 * 校验 APPROVED_MODELS 每条都有文档、都能匹配到适配器，防止清单与文档漂移。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../../..');

const catalogDir = path.join(workspaceRoot, 'src/shared/domain/models/model-catalog');
const catalogSrc = [
  fs.readFileSync(path.join(workspaceRoot, 'src/shared/domain/models/modelCatalog.ts'), 'utf8'),
  ...fs.readdirSync(catalogDir).filter((name) => name.endsWith('.ts')).map((name) => fs.readFileSync(path.join(catalogDir, name), 'utf8')),
].join('\n');
function productionFamilies(file, functionName) {
  const source = fs.readFileSync(path.join(workspaceRoot, 'src/backend/internal/generate', file), 'utf8');
  const body = source.match(new RegExp(`func ${functionName}\\([^]*?\\n\\}`))?.[0];
  if (!body) throw new Error(`Missing production model router: ${functionName}`);
  return [...body.matchAll(/return "([^"]+)"/g)].map(match => match[1]);
}

const adapterIds = new Set([
  ...productionFamilies('image_run.go', 'imageFamily'),
  ...productionFamilies('video_run.go', 'videoFamily'),
  'openai-chat',
]);

const blocks = [...catalogSrc.matchAll(/\{\s*id: '([^']+)',[\s\S]*?adapter: '([^']+)',\s*docs: '([^']+)',/g)];
if (blocks.length === 0) {
  console.error('[check:model-catalog] 未能解析 APPROVED_MODELS');
  process.exit(1);
}

const errors = [];
const seen = new Set();

for (const match of blocks) {
  const [, id, adapter, docs] = match;
  if (seen.has(id)) errors.push(`重复 id：${id}`);
  seen.add(id);

  if (!adapterIds.has(adapter)) {
    errors.push(`${id} 的 adapter「${adapter}」不在 Go 图像/视频路由或 openai-chat 中`);
  }

  const abs = path.join(workspaceRoot, docs);
  const dir = path.dirname(abs);
  const stem = path.basename(docs, '.md');
  const hasIndex = fs.existsSync(abs);
  const hasSpecs = fs.existsSync(dir)
    ? fs.readdirSync(dir).some((name) => name === `${stem}.md` || name.startsWith(`${stem}__`))
    : false;
  if (!hasIndex && !hasSpecs) {
    errors.push(`${id} 缺少文档：${docs}`);
  }
}

const selectionRules = JSON.parse(fs.readFileSync(path.join(catalogDir, 'selectionRules.json'), 'utf8'));
const selectableProfiles = new Map();
for (const { profile, pattern } of selectionRules) {
  if (profile !== 'voice' && !seen.has(profile)) errors.push(`模型筛选规则缺少能力档案：${profile}`);
  if (!pattern) {
    errors.push(`模型筛选规则缺少匹配表达式：${profile}`);
    continue;
  }
  const matcher = new RegExp(`^(?:${pattern})$`, 'i');
  if (profile !== 'voice') selectableProfiles.set(profile, selectableProfiles.get(profile) || matcher.test(profile));
}
for (const [profile, matched] of selectableProfiles) {
  if (!matched) errors.push(`模型筛选规则无法匹配自身档案：${profile}`);
}

if (errors.length > 0) {
  for (const msg of errors) console.error('[check:model-catalog] ' + msg);
  process.exit(1);
}

console.log(`[check:model-catalog] OK  ${blocks.length} 条模型，文档与适配器齐全`);
