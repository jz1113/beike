import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('app/shared/src');
const nodeMarkers = [
  /from ['"]node:/,
  /from ['"]fs['"]/,
  /from ['"]fs\//,
  /from ['"]path['"]/,
  /from ['"]os['"]/,
  /from ['"]crypto['"]/,
  /from ['"]child_process['"]/,
  /from ['"]@aws-sdk/,
  /from ['"]sharp['"]/,
  /from ['"]@prisma\/client['"]/,
  /from ['"]quickjs-emscripten['"]/,
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(root);
const nodeDirect = [];
const browser = [];

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f).split(path.sep).join('/');
  if (nodeMarkers.some((r) => r.test(text))) nodeDirect.push(rel);
  else browser.push(rel);
}

const outDir = 'docs/architecture';
fs.mkdirSync(outDir, { recursive: true });
const md = [
  '# @beike/shared 运行时审计',
  '',
  '拆分依据：直接依赖 Node 原生 / Prisma / sharp / AWS / QuickJS 的模块归入 `@beike/server-kit`；其余归入 `@beike/domain`。',
  '',
  `生成时间：${new Date().toISOString()}`,
  '',
  `## Node-only（直接标记，${nodeDirect.length}）`,
  '',
  ...nodeDirect.sort().map((f) => `- \`${f}\``),
  '',
  `## Domain / browser-safe 候选（${browser.length}）`,
  '',
  ...browser.sort().map((f) => `- \`${f}\``),
  '',
  '## 迁移目标',
  '',
  '- `packages/domain` → `@beike/domain`',
  '- `packages/server-kit` → `@beike/server-kit`',
  '- `packages/contracts` → `@beike/contracts`（从 `app/contracts` 迁入）',
  '- 旧 `@beike/shared` 路径废弃；Web 改 `@beike/domain/*`，API 的 Node 模块改 `@beike/server-kit/*`',
  '',
].join('\n');

fs.writeFileSync(path.join(outDir, 'shared-runtime-audit.md'), md);
console.log(md);
