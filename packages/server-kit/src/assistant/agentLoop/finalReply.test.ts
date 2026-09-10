import { afterEach, expect, it, vi } from 'vitest';
import { streamFinalReply } from './finalReply';

afterEach(() => vi.unstubAllGlobals());

it.each([null, 'length'])('rejects incomplete replies (%s) without silently restarting on another model', async (finishReason) => {
  const fetcher = vi.fn(async () => new Response('data: ' + JSON.stringify({ choices: [{
    delta: { content: '半段回复' }, finish_reason: finishReason,
  }] }) + '\n\n'));
  vi.stubGlobal('fetch', fetcher);
  const send = vi.fn();
  await expect(streamFinalReply({ messages: [], modelsToTry: ['first', 'second'],
    baseUrl: 'https://example.test', apiKey: 'test', send, turnId: 'test',
  })).rejects.toThrow(finishReason ? '输出长度限制' : '提前关闭');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'item/agentMessage/delta', delta: '半段回复' }));
});

it('does not accept DONE alone as proof of a complete reply', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    'data: {"choices":[{"delta":{"content":"未完"}}]}\n\ndata: [DONE]\n\n',
  )));
  await expect(streamFinalReply({ messages: [], modelsToTry: ['first'],
    baseUrl: 'https://example.test', apiKey: 'test', send: vi.fn(), turnId: 'test',
  })).rejects.toThrow('提前关闭');
});

it('reads fragmented UTF-8 and a final finish reason without a trailing newline', async () => {
  const bytes = new TextEncoder().encode('data:{"choices":[{"delta":{"content":"完整回复"}}]}\r\n\r\ndata:{"choices":[{"delta":{},"finish_reason":"stop"}]}');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  }))));
  const send = vi.fn();
  await expect(streamFinalReply({ messages: [], modelsToTry: ['first'],
    baseUrl: 'https://example.test', apiKey: 'test', send, turnId: 'test',
  })).resolves.toBe('first');
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'item/agentMessage/delta', delta: '完整回复' }));
});

it.each([401, 404, 429, 502, 503, 504])('preserves HTTP %s instead of reporting a generic missing stream', async (status) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private upstream body', { status })));
  await expect(streamFinalReply({ messages: [], modelsToTry: ['first'],
    baseUrl: 'https://example.test', apiKey: 'test', send: vi.fn(), turnId: 'test',
  })).rejects.toThrow(`HTTP ${status}`);
});
