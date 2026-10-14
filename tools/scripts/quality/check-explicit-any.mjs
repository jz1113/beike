/** Fail when explicit any exceeds the ceiling, or when the ceiling is higher than the current count. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tools/configs/explicit-any-baseline.json'), 'utf8'));
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'tools/configs/eslint.config.mjs') });
const results = await eslint.lintFiles(['src/client', 'src/shared', 'tools']);
let count = 0;
for (const result of results) {
  for (const message of result.messages) {
    if (message.ruleId === '@typescript-eslint/no-explicit-any') count += 1;
  }
}
if (count > baseline.max) {
  console.error(`Explicit any grew from ${baseline.max} to ${count}. Remove the new any instead of raising the baseline.`);
  process.exitCode = 1;
} else if (count < baseline.max) {
  console.error(`Explicit any fell from ${baseline.max} to ${count}. Lower max in tools/configs/explicit-any-baseline.json.`);
  process.exitCode = 1;
} else {
  console.log(`Explicit any gate passed; ${count} warnings remain.`);
}
