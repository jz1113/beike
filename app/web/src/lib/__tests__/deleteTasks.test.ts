import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteTasksFromServer } from '../deleteTasks';

vi.mock('@/lib/apiClient', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/apiClient';

const mockApiFetch = vi.mocked(apiFetch);

describe('deleteTasksFromServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses query params instead of JSON body', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, count: 2 }), { status: 200 }),
    );

    const result = await deleteTasksFromServer(['id-a', 'id-b'], ['https://example.com/a.jpg']);

    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/assets/tasks?ids=id-a%2Cid-b&urls=https%3A%2F%2Fexample.com%2Fa.jpg',
      { method: 'DELETE' },
    );
    const call = mockApiFetch.mock.calls[0];
    expect(call[1]).not.toHaveProperty('body');
  });

  it('filters data: and blob: urls from request', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, count: 1 }), { status: 200 }),
    );

    await deleteTasksFromServer(
      ['id-a'],
      ['data:image/png;base64,abc', 'blob:http://localhost/x', 'https://short.url/x'],
    );

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/assets/tasks?ids=id-a&urls=https%3A%2F%2Fshort.url%2Fx',
      { method: 'DELETE' },
    );
  });

  it('returns readable message on 502 gateway errors', async () => {
    mockApiFetch.mockResolvedValue(
      new Response('<html>Bad Gateway</html>', { status: 502 }),
    );

    const result = await deleteTasksFromServer(['id-a']);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('无法连接 API 服务，请确认已启动 API（npm run dev:api）或重启桌面端');
  });

  it('returns no-match message when count is zero', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, count: 0 }), { status: 200 }),
    );

    const result = await deleteTasksFromServer(['missing-id']);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('未能匹配到数据库记录，请刷新后重试');
  });
});
