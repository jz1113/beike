/** Only reproducible build/test output. Defaults to a preview; --apply deletes it. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--apply')) throw new Error('Usage: clean-generated.mjs [--apply]');
const targets = [
  'app/web/dist',
  'test-results',
  'playwright-report',
  'coverage',
  'app/web/tsconfig.tsbuildinfo',
  'works/configs/node_modules/.cache/tsconfig.tsbuildinfo',
  '.DS_Store',
  'app/api/node_modules/.DS_Store',
];

function bytes(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(file).reduce((sum, name) => sum + bytes(path.join(file, name)), 0);
}

const entries = targets.flatMap(relative => {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  // Never traverse a redirected build directory or one of its parent directories.
  for (let current = absolute; current !== root; current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Refusing symlink: ${relative}`);
  }
  return [{ path: relative, bytes: bytes(absolute) }];
});
if (args.includes('--apply')) {
  for (const entry of entries) fs.rmSync(path.join(root, entry.path), { recursive: true, force: true });
}
console.log(JSON.stringify({
  mode: args.includes('--apply') ? 'deleted' : 'preview',
  entries, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
}, null, 2));
