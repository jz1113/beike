/** Fail when a source file exceeds 400 lines unless it is in the reviewed baseline. Baseline may only shrink. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const baselinePath = path.join(root, 'tools/configs/max-lines-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const allowed = new Map(baseline.files.map((entry) => [entry.file, entry.lines]));
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'tools/configs/eslint.config.mjs') });
const results = await eslint.lintFiles(['apps', 'packages']);
const added = [];
let remaining = 0;
for (const result of results) {
  for (const message of result.messages) {
    if (message.ruleId !== 'max-lines') continue;
    remaining++;
    const file = path.relative(root, result.filePath).replace(/\\/g, '/');
    const match = /(\d+) lines/.exec(message.message);
    const lines = match ? Number(match[1]) : 401;
    const allowedLines = allowed.get(file);
    if (!allowedLines || lines > allowedLines) {
      added.push(`${file}:${message.line} ${message.message}`);
    }
  }
}
if (added.length) {
  console.error('New max-lines violations:\n' + added.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Max-lines gate passed; ${remaining} reviewed files remain over the 400-line budget.`);
}
