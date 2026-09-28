/** Check static imports, exports and literal dynamic imports; exemptions may only shrink. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { boundaryViolations, featureOf } from './boundary-rules.mjs';
import { isTestFile, moduleReferences, walkSourceFiles } from './source-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tools/configs/import-boundary-baseline.json'), 'utf8'));
const allowed = new Set(baseline.edges), observed = new Set(), errors = [];
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
const files = ['src'].flatMap(dir => walkSourceFiles(path.join(root, dir)))
  .filter(file => /\.[cm]?[jt]sx?$/.test(file) && !isTestFile(file) && !file.endsWith('.d.ts'));
const relative = file => path.relative(root, file).split(path.sep).join('/');
for (const absolute of files) {
  const source = ts.createSourceFile(absolute, fs.readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true);
  const from = relative(absolute);
  for (const specifier of moduleReferences(source)) {
    const resolved = ts.resolveModuleName(specifier, absolute, options, ts.sys).resolvedModule?.resolvedFileName;
    const to = resolved ? relative(resolved) : '';
    const staticAsset = specifier.startsWith('@client/') && fs.existsSync(path.join(root, 'src/client', specifier.slice('@client/'.length).split('?')[0]));
    if (!resolved && !staticAsset && (/^@(client|shared|server)\//.test(specifier))) errors.push(`unresolved-source: ${from} -> ${specifier}`);
    for (const rule of boundaryViolations(from, to, specifier, allowed)) errors.push(`${rule}: ${from} -> ${to || specifier}`);
    if (featureOf(from) && featureOf(to) && featureOf(from) !== featureOf(to)) observed.add(`${featureOf(from)}->${featureOf(to)}`);
  }
}
for (const edge of allowed) if (!observed.has(edge)) errors.push(`stale exemption: remove ${edge} from import-boundary-baseline.json`);
if (errors.length) {
  console.error('Import boundary violations:\n' + [...new Set(errors)].join('\n'));
  process.exitCode = 1;
} else console.log(`Import boundary gate passed; ${files.length} source files; ${allowed.size} reviewed cross-feature edges remain.`);
