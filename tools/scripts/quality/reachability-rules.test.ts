import { describe, expect, it } from 'vitest';
import { unreachableBrowserModules } from './reachability-rules.mjs';

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
