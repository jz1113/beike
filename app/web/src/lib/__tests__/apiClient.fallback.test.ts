import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../apiClient';
import * as desktopRuntime from '../desktopRuntime';
import * as tauriApi from '../tauriApi';

describe('apiClient - 容灾降级双保险', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    desktopRuntime.setApiBase('');
  });

  it('在桌面端直连 fetch 成功时直接返回响应', async () => {
    vi.spyOn(desktopRuntime, 'isTauriDesktop').mockReturnValue(true);
    desktopRuntime.setApiBase('http://127.0.0.1:3000');
    const mockTauri = vi.spyOn(tauriApi, 'invokeTauriApi');

    const expectedRes = new Response(JSON.stringify({ success: true }), { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(expectedRes);

    const res = await apiFetch('/api/generate/image', { method: 'POST' });
    expect(res).toBe(expectedRes);
    expect(mockTauri).not.toHaveBeenCalled();
  });

  it('在桌面端直连 fetch 遭遇网络异常时，自动降级调用 invokeTauriApi', async () => {
    vi.spyOn(desktopRuntime, 'isTauriDesktop').mockReturnValue(true);
    desktopRuntime.setApiBase('http://127.0.0.1:3000');

    // 模拟直连抛出 Failed to fetch (如 CORS 拦截或连接重置)
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const fallbackRes = new Response(JSON.stringify({ success: true, taskId: 'tauri_123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const mockTauri = vi.spyOn(tauriApi, 'invokeTauriApi').mockResolvedValue(fallbackRes);

    const res = await apiFetch('/api/generate/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    });

    expect(res).toBe(fallbackRes);
    expect(mockTauri).toHaveBeenCalledTimes(1);
    const [calledPath, calledInit] = mockTauri.mock.calls[0];
    expect(calledPath).toBe('/api/generate/image');
    expect(calledInit?.method).toBe('POST');
  });

  it('在降级通道也返回 null 时，抛出原始直连异常', async () => {
    vi.spyOn(desktopRuntime, 'isTauriDesktop').mockReturnValue(true);
    desktopRuntime.setApiBase('http://127.0.0.1:3000');

    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Load failed'));
    vi.spyOn(tauriApi, 'invokeTauriApi').mockResolvedValue(null);

    await expect(apiFetch('/api/generate/image')).rejects.toThrow('Load failed');
  });
});
