#!/usr/bin/env node
/** Keep api/openapi.yaml and the generated client types aligned with the Go routes. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRoutes, renderOpenApi } from './openapi-routes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const rendered = renderOpenApi(collectRoutes(root));
const target = path.join(root, 'api/openapi.yaml');

if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, rendered);
  console.log(`[openapi] wrote ${collectRoutes(root).length} routes`);
} else if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== rendered) {
  console.error('[openapi] api/openapi.yaml 与当前路由不一致。运行 node tools/scripts/quality/check-openapi.mjs --write');
  process.exit(1);
} else {
  console.log(`[openapi] OK ${collectRoutes(root).length} routes`);
}

const typesPath = path.join(root, 'src/client/shared/api/openapi-types.ts');
const generatedTypes = path.join(os.tmpdir(), 'beike-openapi-types.ts');
const generated = spawnSync('pnpm', ['exec', 'openapi-typescript', path.join(root, 'api/openapi.yaml'), '-o', generatedTypes], {
  cwd: root,
  encoding: 'utf8',
});
if (generated.status !== 0) {
  console.error(generated.stderr || generated.stdout || '[openapi] 类型生成失败');
  process.exit(1);
}
const freshTypes = fs.readFileSync(generatedTypes, 'utf8');
if (process.argv.includes('--write')) {
  fs.writeFileSync(typesPath, freshTypes);
  console.log('[openapi] wrote client types');
} else if (!fs.existsSync(typesPath) || fs.readFileSync(typesPath, 'utf8') !== freshTypes) {
  console.error('[openapi] src/client/shared/api/openapi-types.ts 已过期。运行 pnpm openapi:write');
  process.exit(1);
} else {
  console.log('[openapi] client types OK');
}
