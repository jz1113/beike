import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAgentLoop, streamFinalReply } from '../agentLoop';
import { AgentRuntime } from '../agentRuntime';
import { runSingleTask } from './toolExecutor';
import type { AgentLoopOptions, ToolCallTask } from './types';

function options(): AgentLoopOptions {
  return { messages: [{ role: 'system', content: '助手' }, { role: 'user', content: '统计文档字数' }], modelsToTry: ['selected-model'], baseUrl: 'https://model.test', apiKey: 'test-key', toolCtx: { origin: 'https://local.test', documents: [{ name: 'sample', extractedText: 'abc' }] }, send: vi.fn(), turnId: 'test-turn', threadId: 'test-thread' };
}
function stream(delta: unknown, finish = 'stop') {
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: finish }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}
afterEach(() => vi.unstubAllGlobals());

describe('Code Mode agent loop', () => {
  it('executes local code between two model messages without an extra final request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(stream({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'execute_code', arguments: JSON.stringify({ code: 'text(input.documents[0].extractedText.length);', title: '统计文档字数' }) } }] }, 'tool_calls')).mockResolvedValueOnce(stream({ content: '文档共 3 个字符。' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runAgentLoop(options());
    expect(result.textStreamed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondRequest.messages.find((m: any) => m.role === 'tool').content).toContain('quickjs-wasm');
    expect(result.runtime.listItems().some((item) => item.kind === 'toolCall' && item.status === 'done')).toBe(true);
  });
  it('keeps a non-streamed answer instead of discarding it and asking again', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('stream unsupported', { status: 400 })).mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '直接回答' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runAgentLoop(options());
    expect(result.textStreamed).toBe(true);
    expect(result.finalMessages.at(-1)).toEqual({ role: 'assistant', content: '直接回答' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('retains the fallback final answer in the same runtime snapshot', async () => {
    const opts = options();
    const runtime = new AgentRuntime({ turnId: opts.turnId, threadId: opts.threadId, send: opts.send });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(stream({ content: '最终结果' })));
    await streamFinalReply({ ...opts, runtime });
    runtime.complete(false);
    const snapshot = runtime.snapshot();
    expect(snapshot.status).toBe('completed');
    expect(snapshot.items.some((item) => item.kind === 'agentMessage' && item.content === '最终结果')).toBe(true);
    expect((opts.send as any).mock.calls.filter(([event]: any) => event.type === 'turn/started')).toHaveLength(1);
  });
  it('answers ordinary conversation with one request and no tool', async () => {
    const fetchMock = vi.fn().mockResolvedValue(stream({ content: '你好' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runAgentLoop(options());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.toolsWereUsed).toBe(false);
  });
  it('does not bypass tool allowlists or approval inside code', async () => {
    const opts = { ...options(), executableToolNames: ['execute_code', 'trigger_generate'] };
    const runtime = new AgentRuntime({ turnId: opts.turnId, threadId: opts.threadId, send: opts.send });
    const task = (code: string): ToolCallTask => ({ index: 0, call: { id: 'code', name: 'execute_code', arguments: '{}' }, toolItemId: runtime.startItem('toolCall'), argsParsed: { code }, parallel: false });
    const result = await runSingleTask(task('text(await tools.trigger_generate({prompt:"test"}));'), { opts, runtime, send: opts.send, sessionApprovals: new Set() });
    expect(result.result).toContain('需要审批');
    const denied = await runSingleTask(task('await tools.query_asset_library({});'), { opts, runtime, send: opts.send, sessionApprovals: new Set() });
    expect(JSON.parse(denied.result).success).toBe(false);
  });
  it('reuses identical read-only queries during the turn', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, assets: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    const opts = { ...options(), executableToolNames: ['query_asset_library'], readToolCache: new Map<string, Promise<string>>() };
    const runtime = new AgentRuntime({ turnId: opts.turnId, threadId: opts.threadId, send: opts.send });
    const task: ToolCallTask = { index: 0, call: { id: 'q1', name: 'query_asset_library', arguments: '{}' }, argsParsed: {}, toolItemId: runtime.startItem('toolCall'), parallel: false };
    const ctx = { opts, runtime, send: opts.send, sessionApprovals: new Set<string>() };
    await runSingleTask(task, ctx);
    await runSingleTask(task, ctx);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
