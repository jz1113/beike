#!/usr/bin/env node
/**
 * 校验轻量工作区 / 模块化单体架构：核心目录、禁止目录、根目录中文杂项、未 ignore 的 junk。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../..');

const REQUIRED_DIRS = ['apps', 'packages', 'tools', 'docs'];
const FORBIDDEN_DIRS = ['工程', '依赖', 'docs/API文档', 'docs/打包', 'app', 'db', 'desktop', 'works', 'apps/desktop'];
const ROOT_CHINESE_ALLOWLIST = new Set();

const errors = [];

const missing = REQUIRED_DIRS.filter((name) => {
  const dir = path.join(workspaceRoot, name);
  return !fs.existsSync(dir) || !fs.statSync(dir).isDirectory();
});
if (missing.length > 0) {
  errors.push('缺失核心目录：' + missing.join('、'));
}

for (const rel of FORBIDDEN_DIRS) {
  const target = path.join(workspaceRoot, rel);
  if (fs.existsSync(target)) {
    errors.push(`禁止目录仍存在：${rel}`);
  }
}

const appsExpected = ['web', 'api'];
for (const name of appsExpected) {
  const dir = path.join(workspaceRoot, 'apps', name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    errors.push(`apps/ 缺少子目录：${name}`);
  }
}

const toolsExpected = ['configs', 'scripts'];
for (const name of toolsExpected) {
  const dir = path.join(workspaceRoot, 'tools', name);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    errors.push(`tools/ 缺少子目录：${name}`);
  }
}

const rootEntries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
for (const entry of rootEntries) {
  if (ROOT_CHINESE_ALLOWLIST.has(entry.name)) continue;
  if (/[\u4e00-\u9fff]/.test(entry.name)) {
    errors.push(`根目录禁止中文文件/目录：${entry.name}`);
  }
}

try {
  const tracked = execSync(
    'git ls-files -- .DS_Store test-results playwright-report coverage "docs/API文档" "docs/打包" "工程" "依赖"',
    { cwd: workspaceRoot, encoding: 'utf8' },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const file of tracked) {
    errors.push(`仍被 Git 跟踪的 junk / 禁止路径：${file}`);
  }
} catch {
  // 非 git 仓库时跳过跟踪检查
}

if (errors.length > 0) {
  for (const msg of errors) console.error('[check:root-layout] ' + msg);
  process.exit(1);
}

console.log('[check:root-layout] OK');
