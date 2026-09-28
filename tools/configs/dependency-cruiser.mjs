/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'domain-no-server-kit',
      comment: 'domain stays browser-safe and free of Node infrastructure',
      severity: 'error',
      from: { path: '^src/shared/domain' },
      to: { path: '^src/server/infrastructure' },
    },
    {
      name: 'web-no-server-kit',
      comment: 'web may not import server-kit',
      severity: 'error',
      from: { path: '^src/client' },
      to: { path: '^src/server/infrastructure' },
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
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
