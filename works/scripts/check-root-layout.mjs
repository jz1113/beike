#!/usr/bin/env node
/**
 * 校验单核扁平架构下的核心目录完整性。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../..');

const REQUIRED_DIRS = ['app', 'db', 'desktop', 'works'];

const missing = REQUIRED_DIRS.filter((name) => {
  const dir = path.join(workspaceRoot, name);
  return !fs.existsSync(dir) || !fs.statSync(dir).isDirectory();
});

if (missing.length > 0) {
  console.error('[check:root-layout] 缺失核心目录：' + missing.join('、'));
  process.exit(1);
}

console.log('[check:root-layout] OK');
