import { afterEach, expect, it, vi } from 'vitest';
import { describeMediaPlaybackError } from './mediaPlayback';

afterEach(() => vi.unstubAllGlobals());

it('diagnoses an unavailable backend even when the media element reports an unsupported source', async () => {
  const cancel = vi.fn().mockResolvedValue(undefined);
  const fetch = vi.fn().mockResolvedValue({ status: 502, ok: false, body: { cancel } });
  vi.stubGlobal('fetch', fetch);
  expect(await describeMediaPlaybackError('/api/system/proxy-video?url=video', 4)).toContain('后台服务已启动');
  expect(fetch).toHaveBeenCalledWith('/api/system/proxy-video?url=video', { headers: { Range: 'bytes=0-0' }, signal: undefined });
  expect(cancel).toHaveBeenCalledOnce();
});

it.each([[401, '未授权'], [403, '访问被拒绝'], [404, '不存在'], [410, '已失效']])('explains HTTP %s without suggesting regeneration', async (status, message) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, ok: false }));
  expect(await describeMediaPlaybackError('/storage/media', 4)).toContain(message);
});

it.each(['/api/system/proxy-image?url=video&as=video', '/api/system/proxy-video?url=video'])('identifies a proxy host policy rejection without claiming the generated file expired: %s', async (src) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('地址被安全策略拦截', { status: 403 })));
  const message = await describeMediaPlaybackError(src, 4);
  expect(message).toContain('媒体来源被后台安全策略拦截');
  expect(message).toContain('重新加载');
  expect(message).not.toMatch(/过期|未授权|重新生成/);
});

it.each([401, 403])('distinguishes an upstream HTTP %s rejection from local application authentication', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('媒体访问被拒绝，请检查素材地址或授权', { status })));
  expect(await describeMediaPlaybackError('/api/system/proxy-video?url=video', 4)).toBe('素材来源拒绝了媒体访问，请检查来源链接或授权后重试。');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"未授权：缺少有效的访问凭证或媒体签名"}', { status: 401 })));
  expect(await describeMediaPlaybackError('/api/system/proxy-video?url=video', 4)).toBe('媒体服务未授权，请刷新页面后重试。');
});

it('does not treat an arbitrary source response as a local policy rejection or expose its content', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('地址被安全策略拦截 private-signed-url', { status: 403 })));
  const message = await describeMediaPlaybackError('https://remote.example.test/file.mp4', 4);
  expect(message).toContain('HTTP 403');
  expect(message).not.toMatch(/后台安全策略拦截|private-signed-url|过期/);
});

it('bounds error-body inspection and cancels the diagnostic stream after reading enough', async () => {
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(4096) + '地址被安全策略拦截')); }, cancel,
  }), { status: 403 });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  expect(await describeMediaPlaybackError('/api/system/proxy-video?url=video', 4)).not.toContain('媒体来源被后台安全策略拦截');
  expect(cancel).toHaveBeenCalledOnce();
});

it('distinguishes decoding errors from service failures and rejects non-media responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { headers: { 'Content-Type': 'video/mp4' } })));
  expect(await describeMediaPlaybackError('/video.mp4', 3)).toContain('格式无法播放');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
  expect(await describeMediaPlaybackError('/video.mp4', 4)).toContain('未返回可播放的文件');
});

it('handles a disconnected service and keeps local object URLs local', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetch);
  expect(await describeMediaPlaybackError('/media')).toContain('无法连接媒体服务');
  fetch.mockClear();
  expect(await describeMediaPlaybackError('blob:local', 4)).toContain('格式无法播放');
  expect(fetch).not.toHaveBeenCalled();
});
