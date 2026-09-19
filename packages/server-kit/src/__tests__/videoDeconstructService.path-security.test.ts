import { describe, it, expect } from 'vitest';
import { resolveLocalVideoPath } from '../videoDeconstructService';

describe('resolveLocalVideoPath 安全路径约束', () => {
  it('拒绝非允许白名单目录下的系统绝对路径与敏感文件', async () => {
    await expect(resolveLocalVideoPath('/etc/passwd')).rejects.toThrow();
    await expect(resolveLocalVideoPath('/var/log/system.log')).rejects.toThrow();
    await expect(resolveLocalVideoPath('/Users')).rejects.toThrow();
  });

  it('拒绝包含空字节的恶意注入路径', async () => {
    await expect(resolveLocalVideoPath('test.mp4\0.png')).rejects.toThrow('无效的视频路径');
  });

  it('拒绝非视频格式的危险文件', async () => {
    await expect(resolveLocalVideoPath('/etc/shadow')).rejects.toThrow();
  });
});
