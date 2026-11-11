import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkUnused } from './check-unused.mjs';
import { checkExplicitAny } from './check-explicit-any.mjs';
import { checkMaxLines } from './check-max-lines.mjs';

const previousExitCode = process.exitCode;
beforeEach(() => {
  process.exitCode = undefined;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  process.exitCode = previousExitCode;
  vi.restoreAllMocks();
});

it.each([
  [checkUnused, '@typescript-eslint/no-unused-vars', 'fixture is unused'],
  [checkExplicitAny, '@typescript-eslint/no-explicit-any', 'Unexpected any'],
  [checkMaxLines, 'max-lines', 'File has too many lines (1001).'],
])('retains baseline rejection when diagnostics are supplied by the shared lint pass', (check, ruleId, message) => {
  check([{ filePath: path.resolve('src/client/fixture.ts'), messages: [{ ruleId, message, line: 1 }] }]);
  expect(process.exitCode).toBe(1);
  expect(console.error).toHaveBeenCalled();
});

it('keeps the 800-line warning budget without clearing earlier gate failures', () => {
  const diagnostics = [{ filePath: path.resolve('src/client/fixture.ts'), messages: [{ ruleId: 'max-lines', message: 'File has too many lines (801).', line: 1 }] }];
  checkMaxLines(diagnostics);
  expect(process.exitCode).toBeUndefined();
  expect(console.warn).toHaveBeenCalled();
  process.exitCode = 1;
  checkUnused([]);
  checkExplicitAny([]);
  checkMaxLines([]);
  expect(process.exitCode).toBe(1);
});
