#!/usr/bin/env node
/** Remove unused SVG files from public/logo/ (keep only paths referenced in src/). */
import { readdirSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const logoDir = join(root, 'public/logo');
const srcDir = join(root, 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?|html|css)$/.test(name)) out.push(p);
  }
  return out;
}

const used = new Set();
const re = /\/logo\/([a-zA-Z0-9_-]+)\.svg/g;
for (const file of walk(srcDir)) {
  const text = readFileSync(file, 'utf8');
  let m;
  while ((m = re.exec(text)) !== null) {
    used.add(`${m[1]}.svg`);
  }
}

const all = readdirSync(logoDir).filter((f) => f.endsWith('.svg'));
let removed = 0;
for (const f of all) {
  if (!used.has(f)) {
    unlinkSync(join(logoDir, f));
    removed++;
  }
}

console.log(`logo whitelist: ${used.size} referenced, removed ${removed} unused (${all.length - removed} kept)`);
