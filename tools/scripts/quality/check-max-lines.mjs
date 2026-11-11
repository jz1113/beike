/** 文件有效代码超过 800 行给出提醒，超过 1000 行且不在已审查基线中时失败。基线只允许收紧。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const WARN_LINES = 800;
const FAIL_LINES = 1000;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const baselinePath = path.join(root, 'tools/configs/max-lines-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const allowed = new Map(baseline.files.map((entry) => [entry.file, entry.lines]));
export function checkMaxLines(results) {
  const added = [];
  const warnings = [];
  let remaining = 0;
  for (const result of results) {
    for (const message of result.messages) {
      if (message.ruleId !== 'max-lines') continue;
      const file = path.relative(root, result.filePath).replace(/\\/g, '/');
      const match = /too many lines\s*\((\d+)\)/i.exec(message.message)
        ?? /(\d+)\s+lines/i.exec(message.message);
      if (!match) {
        added.push(`${file}:${message.line} Unrecognized max-lines diagnostic: ${message.message}`);
        continue;
      }
      const lines = Number(match[1]);
      if (lines <= FAIL_LINES) {
        warnings.push(`${file} ${lines}`);
        continue;
      }
      remaining++;
      const allowedLines = allowed.get(file);
      if (!allowedLines || lines > allowedLines) {
        added.push(`${file}:${message.line} ${message.message}`);
      }
    }
  }
  if (warnings.length) {
    console.warn(`以下文件超过 ${WARN_LINES} 行有效代码，建议按职责拆分:\n` + warnings.join('\n'));
  }
  if (added.length) {
    console.error(`New max-lines violations (> ${FAIL_LINES} lines):\n` + added.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Max-lines gate passed; ${remaining} reviewed files remain over the ${FAIL_LINES}-line budget.`);
  }

}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'tools/configs/eslint.config.mjs') });
  checkMaxLines(await eslint.lintFiles(['src']));
}
