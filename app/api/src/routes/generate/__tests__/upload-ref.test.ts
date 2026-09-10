import { describe, expect, it, vi, afterEach } from 'vitest';
import { POST } from '../upload-ref';
import * as storageModule from '@beike/server-kit/storage';

describe('参考素材上传端点测试 (/api/generate/upload-ref)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('非 multipart/form-data 请求应返回 400', async () => {
    const req = new Request('http://localhost/api/generate/upload-ref', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('multipart/form-data');
  });

  it('缺少 file 字段时应返回 400', async () => {
    const formData = new FormData();
    const req = new Request('http://localhost/api/generate/upload-ref', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('缺少待上传文件');
  });

  it('未配置对象存储时，上传视频应友好提示错误', async () => {
    vi.spyOn(storageModule, 'resolveStorageConfig').mockReturnValue(null as any);

    const formData = new FormData();
    const dummyVideo = new File([new Uint8Array([0, 1, 2, 3])], 'sample.mp4', { type: 'video/mp4' });
    formData.append('file', dummyVideo);

    const req = new Request('http://localhost/api/generate/upload-ref', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('当前未配置对象存储');
  });

  it('未配置对象存储时，上传图片应回退生成 base64 data URL', async () => {
    vi.spyOn(storageModule, 'resolveStorageConfig').mockReturnValue(null as any);

    const formData = new FormData();
    const dummyImage = new File([Buffer.from('mock-image-bytes')], 'test.jpg', { type: 'image/jpeg' });
    formData.append('file', dummyImage);

    const req = new Request('http://localhost/api/generate/upload-ref', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.mediaType).toBe('image');
    expect(json.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('已配置对象存储时，成功上传视频并返回公网 URL', async () => {
    vi.spyOn(storageModule, 'resolveStorageConfig').mockReturnValue({
      provider: 'oss',
      bucket: 'test-bucket',
    } as any);

    vi.spyOn(storageModule, 'uploadBufferToStorage').mockResolvedValue(
      'https://oss.example.com/videos/sample.mp4'
    );

    const formData = new FormData();
    const dummyVideo = new File([new Uint8Array([0, 1, 2, 3])], 'sample.mp4', { type: 'video/mp4' });
    formData.append('file', dummyVideo);

    const req = new Request('http://localhost/api/generate/upload-ref', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.mediaType).toBe('video');
    expect(json.url).toBe('https://oss.example.com/videos/sample.mp4');
  });
});
