import { beforeEach, expect, it, vi } from 'vitest';
const persist = vi.hoisted(() => vi.fn(async (_buffer, _mime, options) => `/storage/${options.filename}`));
vi.mock('@beike/server-kit/persistDataUrl', () => ({ persistBufferToStorage: persist, persistDataUrlToStorage: vi.fn() }));
import { POST } from '../upload';
beforeEach(() => { persist.mockClear(); });
it('同名上传使用不同安全路径并保留视频类型', async () => {
  for (let i = 0; i < 2; i++) {
    const form = new FormData();
    form.append('file', new File(['video'], '../clip.webm'));
    const response = await POST(new Request('http://localhost/api/assets/storage/upload', { method: 'POST', body: form }));
    expect(response.status).toBe(200);
  }
  const first = persist.mock.calls[0];
  const second = persist.mock.calls[1];
  expect(first[1]).toBe('video/webm');
  expect(first[2].filename).toMatch(/^[a-f0-9-]+\.webm$/);
  expect(first[2].filename).not.toBe(second[2].filename);
});
