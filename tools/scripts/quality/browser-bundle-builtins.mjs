import { isBuiltin } from 'node:module';
import ts from 'typescript';
import { build } from 'vite';
import { moduleReferences } from './source-files.mjs';

// Inspect one published module under the globals of a browser or Web Worker.
// Leave its imports external and preserve exported functions, so their reachable
// import() and require() calls remain visible to the normal boundary check.
export async function browserBundleBuiltins(input) {
  const result = await build({
    configFile: false, publicDir: false, logLevel: 'silent',
    define: { process: 'undefined', 'globalThis.process': 'undefined' },
    build: {
      write: false, minify: false,
      rollupOptions: { input, preserveEntrySignatures: 'strict', external: (_id, importer) => Boolean(importer) },
    },
  });
  const builtins = new Set();
  for (const chunk of result.output) {
    if (chunk.type !== 'chunk') continue;
    const source = ts.createSourceFile(input, chunk.code, ts.ScriptTarget.Latest, true);
    for (const name of moduleReferences(source).filter(isBuiltin)) builtins.add(name);
  }
  return builtins;
}
