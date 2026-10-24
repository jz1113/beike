#!/usr/bin/env node
/** Reject source files that no application, test, or declared contract consumes. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unreachableBrowserModules, reachableModules } from './reachability-rules.mjs';

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
