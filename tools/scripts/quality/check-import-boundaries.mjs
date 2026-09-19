/** Static import boundaries. New edges must not appear; listed exceptions may only shrink. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const baselinePath = path.join(root, 'tools/configs/import-boundary-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const allowed = new Set(baseline.edges);

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) files.push(absolute);
  }
}
walk(path.join(root, 'apps/web/src'));
walk(path.join(root, 'apps/api/src'));
walk(path.join(root, 'packages'));

const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
const added = [];

function featureOf(file) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const match = /^apps\/web\/src\/features\/([^/]+)/.exec(rel);
  return match ? match[1] : null;
}

for (const absolute of files) {
  const source = ts.createSourceFile(absolute, fs.readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true);
  const from = path.relative(root, absolute).replace(/\\/g, '/');
  source.forEachChild(function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const resolved = ts.resolveModuleName(node.moduleSpecifier.text, absolute, options, ts.sys).resolvedModule?.resolvedFileName;
      if (!resolved) return;
      const to = path.relative(root, resolved).replace(/\\/g, '/');
      const edge = `${from} -> ${to}`;
      if (from.startsWith('packages/domain/') && to.includes('server-kit')) added.push(edge);
      if (from.startsWith('apps/web/') && to.includes('server-kit')) added.push(edge);
      const fromFeature = featureOf(absolute);
      const toFeature = featureOf(resolved);
      if (fromFeature && toFeature && fromFeature !== toFeature && !allowed.has(`${fromFeature}->${toFeature}`)) {
        added.push(`${fromFeature}->${toFeature} (${from} -> ${to})`);
      }
    }
    ts.forEachChild(node, visit);
  });
}

if (added.length) {
  console.error('New import boundary violations:\n' + [...new Set(added)].join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Import boundary gate passed; ${allowed.size} reviewed cross-feature edges remain.`);
}
