import { describe, expect, it } from 'vitest';
import { testOnlyProductModules, unreachableBrowserModules } from './reachability-rules.mjs';

const module = (source: string, dependencies: string[] = []) => ({
  source, dependencies: dependencies.map(resolved => ({ resolved })),
});

describe('browser entrypoint reachability', () => {
  it('rejects UI and hooks kept alive only by tests while retaining domain verification and test support', () => {
    const modules = [
      module('src/client/main.tsx', ['src/client/features/live/View.tsx']),
      module('src/client/features/live/View.tsx'),
      module('src/client/features/old/components/Panel.test.ts', ['src/client/features/old/components/Panel.tsx']),
      module('src/client/features/old/components/Panel.tsx', ['src/client/features/old/hooks/useOld.ts']),
      module('src/client/features/old/hooks/useOld.ts'),
      module('src/client/features/live/hooks/hooks.test-support.ts'),
      module('src/shared/domain/models/adapter.ts'),
      module('src/shared/domain/models/model-adapters/oldRequest.ts'),
    ];
    expect(testOnlyProductModules(modules, ['src/client/main.tsx'])).toEqual([
      'src/client/features/old/components/Panel.tsx', 'src/client/features/old/hooks/useOld.ts',
      'src/shared/domain/models/model-adapters/oldRequest.ts',
    ]);
  });

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
