#!/usr/bin/env node
/** One manifest, one dependency graph; directories are source layers, never packages. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { manifestErrors, externalDependency } from './structure-rules.mjs';
import { isTestFile, moduleReferences, walkSourceFiles } from './source-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const errors = manifestErrors(manifest);
for (const directory of ['src', 'tools']) {
  for (const file of walkSourceFiles(path.join(root, directory))) {
    const relative = path.relative(root, file);
    if (path.basename(file) === 'package.json') errors.push(`Nested manifest: ${relative}`);
    if (!/\.[cm]?[jt]sx?$/.test(file) || isTestFile(file)) continue;
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const specifier of moduleReferences(source)) {
      const dependency = externalDependency(specifier);
      if (dependency && !manifest.dependencies?.[dependency] && !manifest.devDependencies?.[dependency]) errors.push(`${relative}: undeclared dependency ${dependency}`);
      if (relative.startsWith(`src${path.sep}`) && dependency && !manifest.dependencies?.[dependency] && !file.endsWith('.d.ts') && dependency !== 'vite') errors.push(`${relative}: runtime dependency must be in dependencies: ${dependency}`);
    }
  }
}
if (fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))) errors.push('Remove workspace configuration');
if (errors.length) { console.error([...new Set(errors)].join('\n')); process.exitCode = 1; }
else console.log('Structure gate passed: one root manifest; client / server / shared source layers.');
