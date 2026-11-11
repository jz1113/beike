#!/usr/bin/env node
/** Run ESLint once; apply the existing reviewed baselines to the same diagnostics. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { checkUnused } from './check-unused.mjs';
import { checkExplicitAny } from './check-explicit-any.mjs';
import { checkMaxLines } from './check-max-lines.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'tools/configs/eslint.config.mjs') });
const results = await eslint.lintFiles(['.']);
const formatter = await eslint.loadFormatter('stylish');
const output = formatter.format(results);
if (output) console.log(output);
if (results.some(result => result.errorCount > 0)) process.exitCode = 1;
const baselineScope = results.filter(result => /^(?:src\/(?:client|shared)\/|tools\/)/.test(path.relative(root, result.filePath).split(path.sep).join('/')));
checkUnused(baselineScope);
checkExplicitAny(baselineScope);
checkMaxLines(results.filter(result => path.relative(root, result.filePath).split(path.sep).join('/').startsWith('src/')));
