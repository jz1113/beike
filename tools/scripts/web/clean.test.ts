import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let root: string;
let script: string;

function write(relative: string, contents = 'sentinel') {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}
function clean(...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: os.tmpdir(), encoding: 'utf8' });
}
function exists(relative: string) { return fs.existsSync(path.join(root, relative)); }

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'beike-clean-')));
  script = path.join(root, 'tools/scripts/web/clean.mjs');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(new URL('./clean.mjs', import.meta.url), script);
  for (const file of ['tools/build/ui/index.html', 'tools/build/beike-api', 'node_modules/sentinel', '.env', '.local/keep', 'database/keep.db']) write(file);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('generated output cleanup in an isolated repository', () => {
  it('keeps API and dependencies when cleaning only UI', () => {
    expect(clean().status).toBe(0);
    expect(exists('tools/build/ui')).toBe(false);
    expect(exists('tools/build/beike-api')).toBe(true);
    expect(exists('node_modules/sentinel')).toBe(true);
  });

  it('removes all build output and dependencies only when requested, preserving data', () => {
    expect(clean('--build', '--dependencies').status).toBe(0);
    for (const file of ['tools/build', 'node_modules']) expect(exists(file)).toBe(false);
    for (const file of ['.env', '.local/keep', 'database/keep.db']) expect(exists(file)).toBe(true);
  });

  it('keeps build and installed dependencies when clearing caches', () => {
    write('node_modules/.cache/value');
    write('node_modules/.vite/value');
    expect(clean('--cache').status).toBe(0);
    expect(exists('node_modules/.cache')).toBe(false);
    expect(exists('node_modules/.vite')).toBe(false);
    expect(exists('node_modules/sentinel')).toBe(true);
    expect(exists('tools/build/ui/index.html')).toBe(true);
  });

  it('rejects unknown or conflicting flags without deleting any output', () => {
    expect(clean('--everything').status).not.toBe(0);
    expect(clean('--cache', '--build').status).not.toBe(0);
    expect(exists('tools/build/ui/index.html')).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('validates all paths before deleting output when dependencies point at user data', () => {
    fs.rmSync(path.join(root, 'node_modules'), { recursive: true });
    fs.symlinkSync(path.join(root, 'database'), path.join(root, 'node_modules'), 'dir');
    expect(clean('--build', '--dependencies').status).not.toBe(0);
    expect(exists('tools/build/ui/index.html')).toBe(true);
    expect(exists('database/keep.db')).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('refuses a build path redirected to another project directory', () => {
    fs.rmSync(path.join(root, 'tools/build'), { recursive: true });
    fs.symlinkSync(path.join(root, 'database'), path.join(root, 'tools/build'), 'dir');
    expect(clean('--build').status).not.toBe(0);
    expect(exists('database/keep.db')).toBe(true);
  });
});
