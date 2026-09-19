import { describe, it, expect } from 'vitest';
import { isPrivateIp, assertSafeRemoteUrl } from '../safeUrl';

describe('safeUrl 私网与 SSRF 防御', () => {
  it('正确识别各类私网、保留段与 IPv4-mapped IPv6 地址', () => {
    // 基础私网
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('192.168.1.100')).toBe(true);

    // 云元数据与链路本地
    expect(isPrivateIp('169.254.169.254')).toBe(true);

    // CGNAT (100.64.0.0/10)
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('100.127.255.255')).toBe(true);
    expect(isPrivateIp('100.63.255.255')).toBe(false);
    expect(isPrivateIp('100.128.0.0')).toBe(false);

    // 测试网与协议预留 (192.0.0.0/24, 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
    expect(isPrivateIp('192.0.0.1')).toBe(true);
    expect(isPrivateIp('192.0.2.1')).toBe(true);
    expect(isPrivateIp('198.51.100.1')).toBe(true);
    expect(isPrivateIp('203.0.113.1')).toBe(true);

    // IPv4-mapped IPv6
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);

    // IPv6 本地与组播
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fd00::1')).toBe(true);

    // 合法公网 IP
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('114.114.114.114')).toBe(false);
  });

  it('assertSafeRemoteUrl 拦截私网与非法协议', async () => {
    await expect(assertSafeRemoteUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow();
    await expect(assertSafeRemoteUrl('http://127.0.0.1:8080')).rejects.toThrow();
    await expect(assertSafeRemoteUrl('file:///etc/passwd')).rejects.toThrow();
  });

  it('isAllowedRemoteHost 允许 365yg.com, amemv.com 等社媒视频 CDN 域名', async () => {
    const { isAllowedRemoteHost } = await import('../safeUrl');
    expect(isAllowedRemoteHost('v26-default.365yg.com')).toBe(true);
    expect(isAllowedRemoteHost('v1.amemv.com')).toBe(true);
    expect(isAllowedRemoteHost('sf3-ttcdn-tos.pstatp.com')).toBe(true);
    expect(isAllowedRemoteHost('v3-dy-z.ixigua.com')).toBe(true);
    expect(isAllowedRemoteHost('unknown-malicious-domain.xyz')).toBe(false);
  });
});
