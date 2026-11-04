#!/usr/bin/env node
/** Reject source files that no application, test, or declared contract consumes. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvasRuntimeDependencies, isCanvasRuntimeSource, unreachableBrowserModules, reachableModules } from './reachability-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = execFileSync(process.execPath, [
  path.join(root, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs'),
  'src', '--config', 'tools/configs/dependency-cruiser.mjs', '--output-type', 'json',
], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const { modules } = JSON.parse(output);
const applicationRoots = ['src/client/main.tsx', 'src/client/public/theme-init.js'];
// Wire definitions are explicit contract entrypoints, independent of UI use.
const contractRoots = ['src/shared/contracts/productVariants.ts', 'src/shared/domain/assistant/events.ts'];
const testRoots = modules.map((module) => module.source).filter((source) => /\.test\.tsx?$/.test(source));
const sources = new Set(modules.map((module) => module.source));
// Dependency-cruiser handles static and dynamic imports. Add browser-loaded scripts as
// edges from their actual consumer so a detached bundle still fails this check.
for (const mod of modules.filter(({ source }) => isCanvasRuntimeSource(source))) {
  const content = readFileSync(path.join(root, mod.source), 'utf8');
  for (const target of canvasRuntimeDependencies(mod.source, content)) {
    if (!sources.has(target)) throw new Error(`Missing runtime script: ${mod.source} → ${target}`);
    mod.dependencies.push({ resolved: target });
  }
}
for (const entry of [...applicationRoots, ...contractRoots]) {
  if (!sources.has(entry)) throw new Error(`Reachability entrypoint no longer exists: ${entry}`);
}
const unreachable = unreachableBrowserModules(modules, [...applicationRoots, ...contractRoots, ...testRoots]);
if (unreachable.length) {
  console.error('[reachability] Unconsumed source modules:\n' + unreachable.join('\n'));
  process.exitCode = 1;
} else {
  const production = reachableModules(modules, applicationRoots);
  const testOnly = unreachableBrowserModules(modules, [...applicationRoots, ...contractRoots])
    .filter((source) => !production.has(source) && !/\.test\.tsx?$/.test(source));
  console.log(`[reachability] OK; ${testOnly.length} test-only modules retained, ${contractRoots.length} declared wire contracts.`);
}
