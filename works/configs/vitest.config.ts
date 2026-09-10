import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(root, 'app/web/src'),
      '@beike/contracts': resolve(root, 'packages/contracts/src'),
      '@beike/domain': resolve(root, 'packages/domain/src'),
      '@beike/server-kit': resolve(root, 'packages/server-kit/src'),
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  test: {
    root,
    setupFiles: [resolve(root, "works/configs/vitest.setup.ts")],
    globalSetup: [resolve(root, "works/configs/vitest.global-setup.ts")],
    // API 层用 node 环境；Web 层含 DOM API，用 happy-dom（比 jsdom 更轻）
    environmentMatchGlobs: [
      ['app/web/src/**/*.test.tsx', 'happy-dom'],
      ['app/web/src/**/*.test.ts', 'happy-dom'],
    ],
    include: [
      'app/web/src/**/*.test.ts',
      'app/web/src/**/*.test.tsx',
      'app/api/src/**/*.test.ts',
      'desktop/src/**/*.test.ts',
      'packages/domain/src/**/*.test.ts',
      'packages/domain/src/**/*.test.tsx',
      'packages/server-kit/src/**/*.test.ts',
    ],
    globals: false,
  },
});
