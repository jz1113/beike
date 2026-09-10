import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useAssistantTurn } from '../hooks/useAssistantTurn';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/lib/apiClient', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/gatewayClient', () => ({
  getGatewayClientOverrides: () => ({ customBaseUrl: undefined }),
}));
vi.mock('@/features/assistant/assistantClientActions', () => ({
  approveAssistantTool: vi.fn(),
  executeClientToolAction: vi.fn(),
}));

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return new Response(
      `data: ${JSON.stringify({ type: 'turn/started', turnId: body.turnId, threadId: body.threadId })}\n\n` +
        'data: {"type":"done"}\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  });
});

it('同一会话的每次请求共用 threadId，但使用独立 turnId', async () => {
  const { result } = renderHook(() => useAssistantTurn());
  const params = {
    sessionId: 'assistant-session-1',
    assistantMsgId: 'assistant-message-1',
    messages: [{ role: 'user', content: '继续' }],
    model: 'model-a',
    fallbackModels: [],
    historyLimit: 20,
    systemPrompt: '',
    language: '中字',
    clientContext: {},
    sessionApprovals: [],
    signal: new AbortController().signal,
    onUpdate: vi.fn(),
    showToast: vi.fn(),
  };

  await act(async () => { await result.current.runTurn(params); });
  await act(async () => { await result.current.runTurn(params); });

  const first = JSON.parse(String(apiFetchMock.mock.calls[0][1].body));
  const second = JSON.parse(String(apiFetchMock.mock.calls[1][1].body));
  expect(first.threadId).toBe('assistant-session-1');
  expect(second.threadId).toBe('assistant-session-1');
  expect(first.turnId).toMatch(/^turn_/);
  expect(second.turnId).toMatch(/^turn_/);
  expect(second.turnId).not.toBe(first.turnId);

  apiFetchMock.mockResolvedValueOnce(new Response('data: {"type":"delta","content":"已经生成的半段内容"}\n\n', {
    headers: { 'Content-Type': 'text/event-stream' },
  }));
  await act(async () => {
    await expect(result.current.runTurn(params)).rejects.toThrow('对话连接意外断开');
  });
  expect(params.onUpdate).toHaveBeenCalledWith(expect.objectContaining({ content: '已经生成的半段内容' }));
});
