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
const imageAdaptersSrc = fs.readFileSync(
  path.join(workspaceRoot, 'src/shared/domain/models/model-adapters/image/adapters.ts'),
  'utf8',
);
const videoAdaptersSrc = fs.readFileSync(
  path.join(workspaceRoot, 'src/shared/domain/models/model-adapters/video/adapters.ts'),
  'utf8',
);

const adapterIds = new Set([
  ...[...imageAdaptersSrc.matchAll(/^\s+id: '([^']+)',/gm)].map((m) => m[1]),
  ...[...videoAdaptersSrc.matchAll(/^\s+id: '([^']+)',/gm)].map((m) => m[1]),
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
    errors.push(`${id} 的 adapter「${adapter}」不在 IMAGE/VIDEO 适配器或 openai-chat 中`);
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

if (errors.length > 0) {
  for (const msg of errors) console.error('[check:model-catalog] ' + msg);
  process.exit(1);
}

console.log(`[check:model-catalog] OK  ${blocks.length} 条模型，文档与适配器齐全`);
