#!/usr/bin/env node
/**
 * 一次性迁移：src/app/api 下 route.ts → server/routes
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const srcApi = join(root, 'src/app/api');
const destRoutes = join(root, 'server/routes');

const ROUTES = [
  'health/route.ts → health.ts',
  'catalog/products/route.ts → catalog/products.ts',
  'catalog/collect/route.ts → catalog/collect.ts',
  'catalog/styles/route.ts → catalog/styles.ts',
  'catalog/styles/extract/route.ts → catalog/styles/extract.ts',
  'catalog/styles/parse-link/route.ts → catalog/styles/parse-link.ts',
  'catalog/prompts/route.ts → catalog/prompts.ts',
  'generate/image/route.ts → generate/image.ts',
  'generate/video/route.ts → generate/video.ts',
  'generate/analyze/route.ts → generate/analyze.ts',
  'generate/export-zip/route.ts → generate/export-zip.ts',
  'assets/tasks/route.ts → assets/tasks.ts',
  'assets/storage/test/route.ts → assets/storage/test.ts',
  'assets/storage/migrate/route.ts → assets/storage/migrate.ts',
  'assistant/chat/route.ts → assistant/chat.ts',
  'assistant/sessions/route.ts → assistant/sessions.ts',
  'assistant/extract-document/route.ts → assistant/extract-document.ts',
  'system/proxy-image/route.ts → system/proxy-image.ts',
  'system/config/route.ts → system/config.ts',
  'system/models/fetch/route.ts → system/models/fetch.ts',
];

function depthOf(relPath) {
  return relPath.split('/').length;
}

function adapterImport(destRel) {
  const depth = depthOf(dirname(destRel));
  const prefix = depth <= 0 ? '.' : '../'.repeat(depth + 1);
  return `import { jsonResponse } from '${prefix}adapters/http';\n`;
}

function transform(content, destRel) {
  let out = content;

  out = out.replace(/^import\s*\{[^}]*\}\s*from\s*['"]next\/server['"];?\s*\n/gm, '');
  out = out.replace(/^export const dynamic = ['"]force-dynamic['"];?\s*\n/gm, '');
  out = out.replace(/^export const maxDuration = \d+;?\s*\n/gm, '');
  out = out.replace(/^export const runtime = ['"][^'"]+['"];?\s*\n/gm, '');

  if (!out.includes("from '../adapters/http'") && !out.includes('adapters/http')) {
    out = adapterImport(destRel) + out;
  }

  out = out.replace(/\bNextRequest\b/g, 'Request');
  out = out.replace(/\bNextResponse\.json\s*\(/g, 'jsonResponse(');

  // jsonResponse(data, { status: N }) → jsonResponse(data, N)
  out = out.replace(
    /jsonResponse\(([\s\S]*?),\s*\{\s*status:\s*(\d+)(?:,\s*headers:\s*[^}]+)?\s*\}\s*\)/g,
    'jsonResponse($1, $2)',
  );

  return out;
}

for (const mapping of ROUTES) {
  const [from, to] = mapping.split(' → ').map((s) => s.trim());
  const srcPath = join(srcApi, from);
  const destPath = join(destRoutes, to);
  mkdirSync(dirname(destPath), { recursive: true });
  const raw = readFileSync(srcPath, 'utf8');
  writeFileSync(destPath, transform(raw, to));
  console.log(`✓ ${from} → server/routes/${to}`);
}

rmSync(join(root, 'src/app'), { recursive: true, force: true });
console.log('✓ removed src/app/');
