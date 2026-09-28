import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    '.local/**',
    'tools/build/**',
    'node_modules/**',
  ]),
  {
    files: ['src/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['node:*', '@prisma/client', '@server', '@server/*'] }],
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // PR4 引入渐进式 any 清理：
      // warn 是为拦截新增 any 使用；现存 historical any 通过 PR4～后续 PR 逐项迁移。
      // 待完全清理后改为 'error'。
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'prefer-const': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-misleading-character-class': 'warn',
      'no-control-regex': 'warn',
    },
  },
  {
    files: ['**/*.test.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['tools/scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: [
      'src/server/**/*.{ts,tsx}',
      'src/server/infrastructure/**/*.{ts,tsx}',
      'src/shared/domain/**/*.{ts,tsx}',
      'src/shared/contracts/**/*.{ts,tsx}',
      'tools/scripts/**/*.{js,mjs,ts}',
    ],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
    },
  },
  {
    files: ['src/server/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: '@server/infrastructure/database/prisma', message: '路由层不得直接访问 Prisma，改走 repositories/' }],
      }],
      'no-restricted-globals': ['error', { name: 'fetch', message: '外部 HTTP 调用移至 gateways/' }],
    },
  },
  {
    files: ['src/shared/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'localStorage', message: 'domain 通过 configureDomainRuntime 注入存储' },
        { name: 'fetch', message: 'domain 通过 configureDomainRuntime 注入 fetch' },
        { name: 'process', message: 'domain 通过 domainEnv() 读取环境' },
      ],
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/server/**/*.ts', 'src/server/infrastructure/**/*.ts', 'src/shared/contracts/**/*.ts'],
    rules: {
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
]);
