#!/usr/bin/env node
/**
 * 校验单项目分层架构、入口归属、文档位置与组件分类。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '../../..');

const REQUIRED_DIRS = [
  'src/client', 'src/backend', 'src/shared/contracts', 'src/shared/domain', 'src/shared/data',
  'database', 'src/client/public', 'tools/configs', 'tools/scripts', 'tools/launchers', 'docs', 'tools/deploy',
  'src/client/features/poster', 'src/client/features/keywords', 'src/client/features/ppt', 'src/client/features/sales',
  'src/shared/domain/sales', 'src/backend/internal/keywords', 'src/backend/internal/gateway',
  'src/backend/internal/generate/poster', 'src/backend/internal/generate/sales',
];
const REQUIRED_FILES = [
  'package.json', 'pnpm-lock.yaml', 'go.mod', 'go.sum', 'tsconfig.json',
  'src/client/index.html', 'tools/configs/vite.config.ts', 'src/shared/contracts/openapi.yaml',
  'tools/configs/env.example', '启动贝壳云图.bat',
  'tools/launchers/启动贝壳云图.ps1', 'tools/launchers/启动贝壳云图.command',
];
const FORBIDDEN_PATHS = [
  'public', 'deploy', 'dist', '工程', '依赖', 'docs/API文档', 'docs/打包', 'app', 'db',
  'desktop', 'works', 'apps', 'packages', 'pnpm-workspace.yaml', 'database/backups', 'api', 'tests',
  'index.html', 'vite.config.ts',
  '.env.example', '启动贝壳云图.ps1', '启动贝壳云图.command', 'tools/launchers/启动贝壳云图.bat',
  'src/client/features/headline-poster', 'src/client/features/keyword-review',
  'src/client/features/ppt-generator', 'src/client/features/video-sales', 'src/shared/domain/video-sales',
  'src/backend/internal/keywordreview', 'src/backend/internal/modelgw',
  'src/backend/internal/generate/headline', 'src/backend/internal/generate/videosales',
];
const ROOT_CHINESE_ALLOWLIST = new Set(['启动贝壳云图.bat']);
const ROOT_DIRECTORIES = new Set(['src', 'database', 'node_modules', 'docs', 'tools']);
const ROOT_FILES = new Set([
  'AGENTS.md', 'README.md', 'package.json', 'pnpm-lock.yaml', 'go.mod', 'go.sum',
  'tsconfig.json', 'jsrepo.config.mts', ...ROOT_CHINESE_ALLOWLIST,
]);

const errors = [];

const missing = REQUIRED_DIRS.filter((name) => {
  const dir = path.join(workspaceRoot, name);
  return !fs.existsSync(dir) || !fs.statSync(dir).isDirectory();
});
if (missing.length > 0) {
  errors.push('缺失核心目录：' + missing.join('、'));
}

for (const rel of REQUIRED_FILES) {
  const file = path.join(workspaceRoot, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) errors.push(`缺失核心文件：${rel}`);
}

for (const rel of FORBIDDEN_PATHS) {
  const target = path.join(workspaceRoot, rel);
  if (fs.existsSync(target)) {
    errors.push(`旧路径不应重新出现：${rel}`);
  }
}

const rootEntries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
for (const entry of rootEntries) {
  if (entry.isDirectory() && !entry.name.startsWith('.') && !ROOT_DIRECTORIES.has(entry.name)) {
    errors.push(`根目录新增目录须归入现有职责：${entry.name}`);
  }
  if (entry.isFile() && !entry.name.startsWith('.') && !ROOT_FILES.has(entry.name)) {
    errors.push(`根目录新增文件须归入现有职责：${entry.name}`);
  }
  if (ROOT_CHINESE_ALLOWLIST.has(entry.name)) continue;
  if (/[\u4e00-\u9fff]/.test(entry.name)) {
    errors.push(`根目录禁止中文文件/目录：${entry.name}`);
  }
}

if (fs.existsSync(path.join(workspaceRoot, 'docs'))) {
  for (const entry of fs.readdirSync(path.join(workspaceRoot, 'docs'), { withFileTypes: true })) {
    if (entry.isDirectory()) errors.push(`文档直接放在 docs 根目录：docs/${entry.name}`);
  }
}

function checkComponentGroups(directory) {
  if (!fs.existsSync(directory)) return;
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isFile() && entries[0].name === 'index.ts') {
    const source = fs.readFileSync(path.join(directory, 'index.ts'), 'utf8');
    if (/export\s+.*from\s+['"]\.\.\//.test(source)) {
      errors.push(`组件分类须包含实际实现，不能只有上级转发：${path.relative(workspaceRoot, directory)}`);
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) checkComponentGroups(path.join(directory, entry.name));
  }
}

const featuresPath = path.join(workspaceRoot, 'src/client/features');
if (fs.existsSync(featuresPath)) {
  for (const feature of fs.readdirSync(featuresPath, { withFileTypes: true })) {
    if (feature.isDirectory()) checkComponentGroups(path.join(featuresPath, feature.name, 'components'));
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
