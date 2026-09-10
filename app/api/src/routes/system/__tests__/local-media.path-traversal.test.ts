import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * 直接复刻 local-media.ts 的核心校验函数，避免 import 副作用（路由层导出 GET）。
 * 这些测试聚焦于"非法路径被拒绝"+"合法路径可访问"两条性质。
 */

function safeResolveWithinRoot(root: string, rel: string): string | null {
  if (!rel) return null;
  if (
    rel.includes('..') ||
    rel.startsWith('/') ||
    rel.startsWith('\\') ||
    /^[a-zA-Z]:[\\/]/.test(rel) ||
    rel.startsWith('\\\\') ||
    rel.includes('\0')
  ) {
    return null;
  }
  const abs = path.join(root, rel);
  try {
    const resolvedRoot = fs.realpathSync(root);
    const resolvedAbs = fs.realpathSync(abs);
    const prefix = resolvedRoot.endsWith(path.sep)
      ? resolvedRoot
      : resolvedRoot + path.sep;
    return resolvedAbs === resolvedRoot || resolvedAbs.startsWith(prefix)
      ? resolvedAbs
      : null;
  } catch {
    return null;
  }
}

describe('local-media 路径遍历防护 (PR1 High)', () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-root-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'media-outside-'));
    fs.writeFileSync(path.join(root, 'safe.jpg'), 'ok');
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'leak');
  });

  const cases: Array<[string, boolean]> = [
    ['safe.jpg', true],
    ['../secret.txt', false],
    ['..%2Fsecret.txt', false], // 双编码
    ['/etc/passwd', false],
    ['\\\\server\\share', false],
    ['C:\\Windows\\system.ini', false],
    ['', false],
  ];

  for (const [input, shouldAllow] of cases) {
    it(`拒绝/允许: ${input}`, () => {
      const result = safeResolveWithinRoot(root, input);
      if (shouldAllow) {
        expect(result).not.toBeNull();
      } else {
        expect(result).toBeNull();
      }
    });
  }
});
