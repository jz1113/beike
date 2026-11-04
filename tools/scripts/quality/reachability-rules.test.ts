import { describe, expect, it } from 'vitest';
import { canvasRuntimeDependencies, unreachableBrowserModules } from './reachability-rules.mjs';

const module = (source: string, dependencies: string[] = []) => ({
  source, dependencies: dependencies.map(resolved => ({ resolved })),
});

describe('browser entrypoint reachability', () => {
  it('rejects a detached export barrel and its otherwise referenced implementation', () => {
    const modules = [
      module('src/client/main.tsx', ['src/client/app/App.tsx']),
      module('src/client/app/App.tsx'),
      module('src/client/features/old/index.ts', ['src/client/features/old/Panel.tsx']),
      module('src/client/features/old/Panel.tsx', ['src/client/app/App.tsx']),
    ];
    expect(unreachableBrowserModules(modules, ['src/client/main.tsx'])).toEqual([
      'src/client/features/old/Panel.tsx', 'src/client/features/old/index.ts',
    ]);
  });

  it('allows test and contract roots without admitting unrelated source files', () => {
    const modules = [
      module('src/client/main.tsx', ['src/client/features/live/Panel.tsx']),
      module('src/client/features/live/Panel.tsx'),
      module('src/shared/domain/helper.test.ts', ['src/shared/domain/helper.ts']),
      module('src/shared/domain/helper.ts'),
      module('src/shared/contracts/wire.ts'),
      module('src/client/features/unused/Panel.tsx'),
      module('src/client/vite-env.d.ts'),
    ];
    expect(unreachableBrowserModules(modules, [
      'src/client/main.tsx', 'src/shared/domain/helper.test.ts', 'src/shared/contracts/wire.ts',
    ])).toEqual(['src/client/features/unused/Panel.tsx']);
  });
});

describe('canvas browser-loaded scripts', () => {
  const frame = 'src/client/features/canvas/components/editor/StudioWorkspace.tsx';
  const base = 'src/client/public/canvas-studio/';
  it('follows the iframe base and workers only from reachable modules', () => {
    const entry = base + 'assets/app.js', worker = base + 'assets/depth.js';
    const modules = [
      module('src/client/main.tsx', [frame]),
      module(frame, [...canvasRuntimeDependencies(frame, "<base href='/canvas-studio/'><script defer src='host.js'></script>")]),
      module(base + 'host.js', [entry]),
      module(entry, [...canvasRuntimeDependencies(entry, 'new Worker(new URL("depth.js", import.meta.url))')]),
      module(worker, [...canvasRuntimeDependencies(worker, 'new URL("wasm.mjs",self.location.href)')]),
      module(base + 'assets/wasm.mjs'), module(base + 'assets/orphan.js'),
    ];
    expect(unreachableBrowserModules(modules, ['src/client/main.tsx'])).toEqual([base + 'assets/orphan.js']);
  });

  it('ignores only the unhashed file-protocol self reference and retains missing script targets', () => {
    const dependencies = canvasRuntimeDependencies(base + 'assets/ort-hash.mjs',
      'import.meta.url?.startsWith("file:")?new URL(new URL("ort.mjs",import.meta.url).href,origin):import.meta.url; import.meta.url.startsWith("file:")?new URL("fallback.mjs",import.meta.url):import.meta.url; new URL("missing.mjs",import.meta.url,)');
    expect([...dependencies]).toEqual([base + 'assets/fallback.mjs', base + 'assets/missing.mjs']);
  });
});
