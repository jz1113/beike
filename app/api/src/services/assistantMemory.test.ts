import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AssistantMemoryStore, summarizeMemory } from './assistantMemory';
import { buildAssistantMessages } from './assistantMessageBuilder';

let directory: string;
let store: AssistantMemoryStore;
const messages = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, timestamp: i + 1, role: i % 2 ? 'assistant' : 'user', content: `消息${i}` }));
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'assistant-memory-test-')); store = new AssistantMemoryStore(directory); });
afterEach(async () => { vi.unstubAllGlobals(); await fs.rm(directory, { recursive: true, force: true }); });

it('只归档不调用模型，之后增量压缩并跨实例读取，隔离其他会话', async () => {
  const summarize = vi.fn(async () => '用户喜欢简洁文案；待选三张封面');
  await store.remember('a', messages(31));
  expect((await store.get('a')).summary).toBe('');
  await store.remember('a', messages(31), summarize);
  expect(summarize).toHaveBeenCalledTimes(1);
  expect(summarize.mock.calls[0]).toBeDefined();
  expect(await new AssistantMemoryStore(directory).get('a')).toMatchObject({ coveredCount: 11, pendingCount: 20, summary: '用户喜欢简洁文案；待选三张封面' });
  await store.remember('a', messages(31), summarize);
  expect(summarize).toHaveBeenCalledTimes(1);
  expect((await store.get('b')).summary).toBe('');
});
it('摘要失败保留旧摘要和待处理文本，下一次可以继续', async () => {
  await store.remember('a', messages(31), async () => '旧记忆');
  await expect(store.remember('a', messages(42), async () => { throw new Error('HTTP 429'); })).rejects.toThrow('429');
  expect(await store.get('a')).toMatchObject({ summary: '旧记忆', pendingCount: 31, coveredCount: 11 });
  const merge = vi.fn(async (old: string) => old + '；新纠正');
  await store.remember('a', messages(42), merge);
  expect(merge.mock.calls[0][0]).toBe('旧记忆');
  expect(await store.get('a')).toMatchObject({ summary: '旧记忆；新纠正', pendingCount: 20, coveredCount: 22 });
});
it('关闭时不积累，清除后不会从客户端旧消息重建摘要', async () => {
  await store.configure('a', { enabled: false });
  await store.remember('a', messages(31));
  expect((await store.get('a')).pendingCount).toBe(0);
  await store.configure('a', { enabled: true });
  await store.remember('a', messages(31), async () => '记忆');
  await store.configure('a', { clear: true });
  await store.remember('a', [...messages(31), { id: 'new', timestamp: Date.now() + 100, role: 'user', content: '新的偏好' }]);
  expect(await store.get('a')).toMatchObject({ summary: '', pendingCount: 1, coveredCount: 0 });
});
it('并发调用只压缩一次，清除等待正在执行的压缩完成，旧记忆不会复活', async () => {
  const summarize = vi.fn(async () => '记忆');
  await Promise.all([store.remember('a', messages(31), summarize), store.remember('a', messages(31), summarize)]);
  expect(summarize).toHaveBeenCalledTimes(1);
  await Promise.all([store.remember('a', messages(42), summarize), store.configure('a', { clear: true })]);
  expect(await store.get('a')).toMatchObject({ summary: '', pendingCount: 0 });
});
it('摘要注入独立于最近消息窗口，最新请求仍保留', async () => {
  const result = await buildAssistantMessages({ historyLimit: 2, memorySummary: '早期确定品牌名：星野', messages: messages(6) as any });
  expect(JSON.stringify(result.formattedMessages)).toContain('星野');
  expect(JSON.stringify(result.formattedMessages)).toContain('消息5');
  expect(JSON.stringify(result.formattedMessages)).not.toContain('消息0');
});
it('截断摘要不能覆盖记忆，HTTP 错误可识别', async () => {
  const options = { previous: '', text: '测试', model: 'test', baseUrl: 'https://example.test', apiKey: 'test' };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '半段' } }] }))));
  await expect(summarizeMemory(options)).rejects.toThrow('未完整生成');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
  await expect(summarizeMemory(options)).rejects.toThrow('429');
});
it('长消息分批处理且不丢失末尾，删除会话同时清除记忆', async () => {
  const input = messages(31); input[0].content = '前'.repeat(25000) + '尾';
  const batches: string[] = [];
  await store.remember('../a', input, async (_, text) => { batches.push(text); return '摘要'; });
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.join('')).toContain('尾');
  expect((await store.get('../a')).coveredCount).toBe(11);
  await store.remove('../a');
  expect((await store.get('../a')).summary).toBe('');
});
