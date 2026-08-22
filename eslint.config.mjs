import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**', 'src-tauri/target/**', 'src-tauri/resources/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'prefer-const': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-misleading-character-class': 'warn',
      'no-control-regex': 'warn',
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
    files: ['server/**/*.{ts,tsx}', 'tools/scripts/**/*.{js,mjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
    },
  },
]);
