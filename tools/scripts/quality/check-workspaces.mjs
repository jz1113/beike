#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { workspaces, workspaceManifestErrors } from './workspace-rules.mjs';
import { isTestFile, moduleReferences, walkSourceFiles } from './source-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const errors = [];
for (const parent of ['apps', 'packages']) {
  for (const entry of fs.readdirSync(path.join(root, parent), { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink() && !workspaces[`${parent}/${entry.name}`]) {
      errors.push(`Unexpected workspace directory: ${parent}/${entry.name}`);
    }
  }
}
for (const [directory, policy] of Object.entries(workspaces)) {
  const manifestPath = path.join(root, directory, 'package.json');
  if (!fs.existsSync(manifestPath)) { errors.push(`Missing ${directory}/package.json`); continue; }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  errors.push(...workspaceManifestErrors(directory, manifest).map(message => `${directory}: ${message}`));
  for (const file of walkSourceFiles(path.join(root, directory, 'src')).filter(file => /\.[cm]?[jt]sx?$/.test(file) && !isTestFile(file))) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const specifier of moduleReferences(source)) {
      const dependency = /^(@beike\/[^/]+)/.exec(specifier)?.[1];
      if (dependency && dependency !== policy.name && !manifest.dependencies?.[dependency]) {
        errors.push(`${path.relative(root, file)}: missing runtime workspace dependency ${dependency}`);
      }
    }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Workspace gate passed: 2 applications + 4 shared/schema packages; local-only internal dependencies.');
