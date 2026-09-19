/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'domain-no-server-kit',
      comment: 'domain stays browser-safe and free of Node infrastructure',
      severity: 'error',
      from: { path: '^packages/domain/src' },
      to: { path: '^packages/server-kit' },
    },
    {
      name: 'web-no-server-kit',
      comment: 'web may not import server-kit',
      severity: 'error',
      from: { path: '^app/web/src' },
      to: { path: '^packages/server-kit' },
    },
    {
      name: 'shared-no-features',
      comment: 'shared/ may not import feature slices',
      severity: 'error',
      from: { path: '^app/web/src/shared' },
      to: { path: '^app/web/src/features' },
    },
    {
      name: 'no-circular',
      comment: 'keep feature modules acyclic',
      severity: 'warn',
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
