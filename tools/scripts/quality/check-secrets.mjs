#!/usr/bin/env node
/**
 * Scan tracked and untracked, non-ignored text files for credential-like patterns.
 * Does not embed known leaked values; relies on structural signatures only.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns',
  '.mp4', '.mov', '.wav', '.mp3', '.woff', '.woff2', '.ttf', '.eot',
  '.pdf', '.zip', '.gz', '.tgz', '.db', '.sqlite', '.bin', '.exe',
  '.dll', '.so', '.dylib', '.lock',
]);

const SKIP_PATH = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)target\//,
  /(^|\/)\.git\//,
  /(^|\/)binaries\//,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
];

const PATTERNS = [
  { name: 'openai-style-key', re: /(?:^|[^A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}/ },
  { name: 'github-secret-fallback', re: /secrets\.\w+\s*\|\|/ },
  { name: 'pem-private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'aws-access-key', re: /(?:^|[^A-Z0-9])AKIA[0-9A-Z]{16}(?:[^A-Z0-9]|$)/ },
  { name: 'github-token', re: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
];

function listTrackedFiles() {
  try {
    return execSync('git ls-files -z --cached --others --exclude-standard', { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  } catch {
    return walk(root, '');
  }
}

function walk(dir, rel) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (SKIP_PATH.some((re) => re.test(`${nextRel}/`) || re.test(nextRel))) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, nextRel));
    else files.push(nextRel);
  }
  return files;
}

const hits = [];
for (const rel of listTrackedFiles()) {
  const normalized = rel.replace(/\\/g, '/');
  if (SKIP_PATH.some((re) => re.test(normalized))) continue;
  if (SKIP_EXT.has(path.extname(normalized).toLowerCase())) continue;
  const full = path.join(root, normalized);
  let text;
  try {
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) continue;
    text = buf.toString('utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of PATTERNS) {
      if (pattern.re.test(line)) {
        hits.push(`${normalized}:${i + 1} ${pattern.name}`);
      }
    }
  }
}

if (hits.length) {
  console.error('Secret-like patterns found:\n' + hits.join('\n'));
  process.exit(1);
}

console.log('Secret scan passed.');
