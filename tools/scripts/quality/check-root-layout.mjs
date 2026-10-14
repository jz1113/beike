#!/usr/bin/env node
/**
 * 校验单项目分层架构：核心目录、禁止目录、根目录中文杂项、未 ignore 的 junk。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../../..');

const REQUIRED_DIRS = ['src/client', 'src/backend', 'src/shared/contracts', 'src/shared/domain', 'database', 'src/client/public', 'tools/configs', 'tools/scripts', 'docs', 'tools/deploy'];
const FORBIDDEN_DIRS = ['public', 'deploy', 'dist', '工程', '依赖', 'docs/API文档', 'docs/打包', 'app', 'db', 'desktop', 'works', 'apps', 'packages', 'pnpm-workspace.yaml', 'database/backups'];
const ROOT_CHINESE_ALLOWLIST = new Set(['启动贝壳云图.command', '启动贝壳云图.bat', '启动贝壳云图.ps1']);
const ROOT_DIRECTORIES = new Set(['src', 'database', 'node_modules', 'docs', 'tools', 'api', 'tests']);

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

const rootEntries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
for (const entry of rootEntries) {
  if (entry.isDirectory() && !entry.name.startsWith('.') && !ROOT_DIRECTORIES.has(entry.name)) {
    errors.push(`根目录新增目录须归入现有职责：${entry.name}`);
  }
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
