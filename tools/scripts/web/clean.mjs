#!/usr/bin/env node
/** Cross-platform cleanup of the same generated paths on Windows, macOS and Linux. */
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--dependencies')) throw new Error('只支持 --dependencies');
const targets = ['tools/build/ui', ...(args.includes('--dependencies') ? ['node_modules'] : [])];

for (const target of targets) {
  const absolute = join(root, target);
  if (!existsSync(absolute)) continue;
  const resolved = realpathSync(absolute);
  const withinRoot = relative(root, resolved);
  if (!withinRoot || withinRoot === '..' || withinRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(withinRoot)) {
    throw new Error(`清理目标必须位于项目内：${target}`);
  }
  rmSync(absolute, { recursive: true, force: true });
  console.log(`[clean] ${target}`);
}
