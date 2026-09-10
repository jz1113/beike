import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AssistantMemoryPanel from '../components/AssistantMemoryPanel';
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ apiFetch: apiFetchMock }));
afterEach(cleanup);
beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return new Response(JSON.stringify({ success: true, memory: { enabled: body.enabled ?? true,
      summary: body.clear ? '' : '用户偏好简洁文案', pendingCount: 20, coveredCount: 11, updatedAt: 0 } }));
  });
});
it('查看本会话摘要，可关闭记忆，确认清除后更新界面', async () => {
  render(<AssistantMemoryPanel sessionId="session-a" onClose={vi.fn()} />);
  expect(await screen.findByText('用户偏好简洁文案')).toBeInTheDocument();
  expect(apiFetchMock.mock.calls[0][0]).toBe('/api/assistant/threads/session-a/memory');
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
  fireEvent.click(screen.getByText('清除本会话记忆'));
  expect(apiFetchMock).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByText('确认清除'));
  await waitFor(() => expect(screen.queryByText('用户偏好简洁文案')).not.toBeInTheDocument());
  expect(JSON.parse(apiFetchMock.mock.calls[2][1].body)).toEqual({ clear: true });
});
it('读取失败明确提示，不显示不存在的摘要', async () => {
  apiFetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, error: '读取失败' }), { status: 500 }));
  render(<AssistantMemoryPanel sessionId="session-b" onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('读取失败');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
