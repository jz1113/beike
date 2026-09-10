import { describe, it, expect } from 'vitest';

/**
 * depthPythonRunner 在 PR1 修复后增加 assertSafePath：
 * 仅允许 AZHUO_CACHE_DIR / AZHUO_DATA_DIR / TMPDIR / os.tmpdir() 下的路径。
 */

import { readFileSync } from 'node:fs';

describe('depthPythonRunner — 路径白名单 (PR1 High)', () => {
  it('必须包含 assertSafePath 校验', () => {
    const src = readFileSync(
      'app/api/src/services/depthPythonRunner.ts',
      'utf8',
    );
    expect(src).toContain('assertSafePath');
    expect(src).toContain('allowedRoots');
    expect(src).toContain('os.tmpdir()');
  });

  it('调用前需对 inputPath / outputPath / framesDir / depthDir 全校验', () => {
    const src = readFileSync(
      'app/api/src/services/depthPythonRunner.ts',
      'utf8',
    );
    expect(src).toContain("assertSafePath(options.inputPath");
    expect(src).toContain("assertSafePath(options.outputPath");
    expect(src).toContain("assertSafePath(options.framesDir");
    expect(src).toContain("assertSafePath(options.depthDir");
  });
});
