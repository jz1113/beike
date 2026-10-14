/** Keep the independent Zod transport contract and browser-safe domain state machine aligned. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contract = path.join(root, 'src/shared/contracts/workshopPipeline.ts');
const domain = path.join(root, 'src/shared/domain/workshop/workshop-pipeline/states.ts');

function values(file, name) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  let declaration;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    declaration = statement.declarationList.declarations.find((entry) => ts.isIdentifier(entry.name) && entry.name.text === name);
    if (declaration) break;
  }
  if (!declaration?.initializer) throw new Error(`缺少状态定义 ${name}: ${file}`);
  let expression = declaration.initializer;
  if (ts.isAsExpression(expression)) expression = expression.expression;
  if (ts.isCallExpression(expression)) expression = expression.arguments[0];
  if (!expression || !ts.isArrayLiteralExpression(expression)) throw new Error(`状态定义必须是静态数组: ${name}`);
  return expression.elements.map((entry) => {
    if (!ts.isStringLiteral(entry)) throw new Error(`状态定义必须是字符串: ${name}`);
    return entry.text;
  });
}

const aligned = [
  ['WORKSHOP_BATCH_STATUSES', 'WORKSHOP_BATCH_STATUSES'],
  ['pipelineRunKindSchema', 'PIPELINE_RUN_KINDS'],
  ['pipelineRunStatusSchema', 'PIPELINE_RUN_STATUSES'],
  ['outputReviewDecisionSchema', 'OUTPUT_REVIEW_DECISIONS'],
];
for (const [contractName, domainName] of aligned) {
  const left = values(contract, contractName);
  const right = values(domain, domainName);
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(`${contractName} 与 ${domainName} 不一致`);
}
console.log('Workshop contract/domain status alignment passed.');
