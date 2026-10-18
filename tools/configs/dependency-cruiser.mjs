/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'no-orphans',
      comment: 'every source file must be imported, except entrypoints, tests and feature barrels',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: [
          '\\.test\\.tsx?$',
          '(^|/)main\\.tsx$',
          '(^|/)vite-env\\.d\\.ts$',
          '^src/client/public/',
          '^src/client/features/[^/]+/index\\.ts$',
          '^src/client/features/(assets|settings)/components/index\\.ts$',
        ],
      },
      to: {},
    },
    {
      name: 'shared-no-features',
      comment: 'shared/ may not import feature slices',
      severity: 'error',
      from: { path: '^src/client/shared' },
      to: { path: '^src/client/features' },
    },
    {
      name: 'no-circular',
      comment: 'keep feature modules acyclic',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.go$' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
