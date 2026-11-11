#!/usr/bin/env node
/** Reject source files that no application, test, or declared contract consumes. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unreachableBrowserModules, reachableModules, testOnlyProductModules } from './reachability-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs'),
  'src', '--config', 'tools/configs/dependency-cruiser.mjs', '--output-type', 'json',
], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (result.error) throw result.error;
if (!result.stdout) throw new Error(result.stderr || 'dependency-cruiser did not return a dependency graph');
const { modules, summary } = JSON.parse(result.stdout);
if (result.status !== 0) {
  for (const violation of summary?.violations || []) {
    console.error(`[dependencies] ${violation.rule?.name}: ${violation.from} -> ${violation.to}`);
  }
  if (!(summary?.violations?.length)) console.error(result.stderr || 'Dependency validation failed');
  process.exit(result.status || 1);
}
console.log('[dependencies] OK; circular imports, orphans and shared boundaries checked.');
if (process.argv.includes('--dependencies-only')) process.exit(0);
const applicationRoots = ['src/client/main.tsx', 'src/client/public/theme-init.js'];
// Wire definitions are explicit contract entrypoints, independent of UI use.
const contractRoots = ['src/shared/contracts/workshopPipeline.ts', 'src/shared/domain/assistant/events.ts'];
const testRoots = modules.map((module) => module.source).filter((source) => /\.test\.tsx?$/.test(source));
const sources = new Set(modules.map((module) => module.source));
for (const entry of [...applicationRoots, ...contractRoots]) {
  if (!sources.has(entry)) throw new Error(`Reachability entrypoint no longer exists: ${entry}`);
}
const unreachable = unreachableBrowserModules(modules, [...applicationRoots, ...contractRoots, ...testRoots]);
const detachedUI = testOnlyProductModules(modules, applicationRoots);
const production = reachableModules(modules, applicationRoots);
const importedTestSupport = [...production].filter(source => /\.test-support\.[cm]?[jt]sx?$/.test(source));
if (unreachable.length || detachedUI.length || importedTestSupport.length) {
  if (unreachable.length) console.error('[reachability] Unconsumed source modules:\n' + unreachable.join('\n'));
  if (detachedUI.length) console.error('[reachability] Product UI/hooks/adapters without an application consumer:\n' + detachedUI.join('\n'));
  if (importedTestSupport.length) console.error('[reachability] Test support imported by the application:\n' + importedTestSupport.join('\n'));
  process.exitCode = 1;
} else {
  const testOnly = unreachableBrowserModules(modules, [...applicationRoots, ...contractRoots])
    .filter((source) => !production.has(source) && !/\.test\.tsx?$/.test(source));
  console.log(`[reachability] OK; ${testOnly.length} test-only modules retained, ${contractRoots.length} declared wire contracts.`);
}
