/** Generate works/configs/max-lines-baseline.json from current ESLint max-lines warnings. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'works/configs/eslint.config.mjs') });
const results = await eslint.lintFiles(['app', 'packages']);
const files = [];
for (const result of results) {
  for (const message of result.messages) {
    if (message.ruleId !== 'max-lines') continue;
    const file = path.relative(root, result.filePath).replace(/\\/g, '/');
    const match = /(\d+) lines/.exec(message.message);
    files.push({ file, lines: match ? Number(match[1]) : 401 });
  }
}
files.sort((a, b) => a.file.localeCompare(b.file));
const output = path.join(root, 'works/configs/max-lines-baseline.json');
fs.writeFileSync(output, JSON.stringify({ files }, null, 2) + '\n');
console.log(`Wrote ${files.length} max-lines baseline entries to ${path.relative(root, output)}`);
