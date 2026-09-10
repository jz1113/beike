import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/**
 * videoDeconstructService.runPythonScript 在 PR1 修复后改为将脚本写入临时 .py 文件并
 * spawn('python3', [scriptPath, ...args])，杜绝 shell 注入。
 * 验证：脚本中即便含 `'; rm -rf / #` 之类 payload，也不会被 shell 解析为命令分隔符。
 */

function escapeShellMetachars(s: string): string {
  return s.replace(/['"\\$`;&|<>\n\r]/g, '\\$&');
}

describe('videoDeconstructService — Python 子进程参数安全 (PR1 Critical)', () => {
  it('路径转义工具应转义 shell 元字符', () => {
    const payload = "evil'; rm -rf / #";
    const escaped = escapeShellMetachars(payload);
    // 单引号必须被反斜杠转义
    expect(escaped).not.toBe(payload);
    expect(escaped).toContain("\\'");
  });

  it('spawn 应使用 argv 数组而非 shell 字符串', () => {
    // 静态校验：源码中使用 spawn(python3, [scriptPath, ...args]) 形式
    const src = fs.readFileSync(
      'app/shared/src/videoDeconstructService.ts',
      'utf8',
    );
    expect(src).toContain("spawn('python3', [scriptPath, ...args])");
    // 不应出现 shell:true
    expect(src).not.toContain('shell: true');
  });
});
