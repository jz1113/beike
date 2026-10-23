import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@client': path.join(root, 'src/client'),
      '@shared': path.join(root, 'src/shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
