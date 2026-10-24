#!/usr/bin/env node
/** Cross-platform cleanup of the same generated paths on Windows, macOS and Linux. */
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
const args = process.argv.slice(2);
if (args.some(arg => !['--dependencies', '--cache', '--build'].includes(arg))
    || (args.includes('--cache') && args.length !== 1)) {
  throw new Error('支持 --build、--dependencies，或单独使用 --cache');
}
const targets = args.includes('--cache')
  ? ['node_modules/.vite', 'node_modules/.vite-temp', 'node_modules/.vitest-cache', 'node_modules/.cache']
  : [args.includes('--build') ? 'tools/build' : 'tools/build/ui', ...(args.includes('--dependencies') ? ['node_modules'] : [])];

// Validate every target before deleting anything; reject redirected build/cache paths.
const validated = [];
for (const target of targets) {
  const absolute = join(root, target);
  if (!existsSync(absolute)) continue;
  const resolved = realpathSync(absolute);
  const withinRoot = relative(root, resolved);
  if (!withinRoot || withinRoot === '..' || withinRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(withinRoot)
      || relative(absolute, resolved) !== '') {
    throw new Error(`清理目标必须是项目内的实际生成目录，不能经符号链接重定向：${target}`);
  }
  validated.push({ target, absolute });
}
for (const { target, absolute } of validated) {
  rmSync(absolute, { recursive: true, force: true });
  console.log(`[clean] ${target}`);
}
