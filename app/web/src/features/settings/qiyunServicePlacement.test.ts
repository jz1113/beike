import { describe, it, expect } from 'vitest';
import { API_SERVICES } from './settingsShared';

describe('API Services List Ordering & Qiyun Parser', () => {
  it('places qiyun_parser directly after apia_parser', () => {
    const apiaIndex = API_SERVICES.findIndex((s) => s.id === 'apia_parser');
    const qiyunIndex = API_SERVICES.findIndex((s) => s.id === 'qiyun_parser');

    expect(apiaIndex).toBeGreaterThanOrEqual(0);
    expect(qiyunIndex).toBe(apiaIndex + 1);
  });

  it('qiyun_parser contains correct metadata and capabilities', () => {
    const qiyunService = API_SERVICES.find((s) => s.id === 'qiyun_parser');
    expect(qiyunService).toBeDefined();
    expect(qiyunService?.name).toContain('奇云');
    expect(qiyunService?.tag).toContain('30+平台去水印');
    expect(qiyunService?.defaultBaseUrl).toBe('https://qyapi.ipaybuy.cn/api/video');
    expect(qiyunService?.capabilities).toContain('微信视频号');
  });
});
