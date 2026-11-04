import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { browserBundleBuiltins } from './browser-bundle-builtins.mjs';

it('keeps reachable builtin imports while excluding the Node-only branch of a browser bundle', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'beike-boundary-'));
  try {
    const input = path.join(dir, 'vendor.mjs');
    await writeFile(input, `
      import 'node:url';
      const node = typeof globalThis.process?.versions?.node === 'string';
      export async function start() {
        if (node) return import('worker_threads');
        if (typeof process === 'object') return require('os');
        return [await import('node:path'), require('fs')];
      }
    `);
    expect(await browserBundleBuiltins(input)).toEqual(new Set(['node:url', 'node:path', 'fs']));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
