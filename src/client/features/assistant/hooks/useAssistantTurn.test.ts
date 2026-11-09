import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ events: [] as Record<string, unknown>[], fetch: vi.fn(), snapshot: vi.fn(),
  credentials: { customBaseUrl: 'https://original.example', customApiKey: 'original-key', textProtocol: 'openai' } as { customBaseUrl?: string; customApiKey?: string; textProtocol: string } }));
vi.mock('react', () => ({ useRef: (current: unknown) => ({ current }), useCallback: (fn: unknown) => fn }));
vi.mock('@client/shared/api/apiClient', async (original) => ({ ...await original<typeof import('@client/shared/api/apiClient')>(), apiFetch: mocks.fetch }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getMultimodalClientOverrides: () => ({ ...mocks.credentials }), getGatewayClientHeaders: () => ({}) }));
vi.mock('../api/assistantClientActions', () => ({ approveAssistantTool: vi.fn(), executeClientToolAction: vi.fn(), fetchAssistantTurnSnapshot: mocks.snapshot }));
vi.mock('@client/shared/api/sseStream', () => ({ readSseEvents: async function* () { yield* mocks.events; } }));
vi.mock('@client/shared/prompt-bar/promptBarPreferencesTypes', () => ({ loadPromptPreferences: () => ({}) }));
import { withModelRoute } from '@client/shared/api/apiClient';
import { useAssistantTurn } from './useAssistantTurn';
import { getUsageLogs } from '@client/shared/utils/usageTracker';
import { readAssistantRetryDecision } from '../model/assistantActivity';

beforeEach(() => {
 vi.clearAllMocks();
 const values = new Map<string, string>([['beike_workspace_secret', 'original-workspace-secret'.repeat(3)]]);
 vi.stubGlobal('localStorage', { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
  getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } });
 vi.stubGlobal('window', { dispatchEvent: vi.fn() });
 mocks.credentials = { customBaseUrl: 'https://original.example', customApiKey: 'original-key', textProtocol: 'openai' };
 mocks.events = [{ type: 'usage', usage: { prompt_tokens: 5 } }, { type: 'turn/completed' }];
 mocks.fetch.mockResolvedValue(new Response('stream', { headers: { 'content-type': 'text/event-stream' } }));
});
afterEach(() => vi.unstubAllGlobals());
const params = () => ({ sessionId: 'chat', assistantMsgId: 'reply', messages: [{ role: 'user', content: 'hello' }], model: 'gpt-6-luna',
 fallbackModels: [], historyLimit: 20, systemPrompt: '', language: 'zh', clientContext: {}, sessionApprovals: [],
 signal: new AbortController().signal, onUpdate: vi.fn(), onTurnPrepared: vi.fn(), showToast: vi.fn() });
const changeSettings = () => {
 mocks.credentials = { customBaseUrl: 'https://new.example', customApiKey: 'new-key', textProtocol: 'openai' };
 localStorage.setItem('beike_workspace_secret', 'changed-workspace-secret'.repeat(3));
};
it('freezes wire credentials and persists scope before the prepared callback can change settings', async () => {
 const hook = useAssistantTurn(); const input = params();
 input.onTurnPrepared.mockImplementation((id: string) => {
  expect(localStorage.getItem(`ai_assistant_turn_usage:${id}`)).toContain('channelId'); changeSettings();
 });
 await hook.runTurn(input);
 const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
 expect(new Headers(mocks.fetch.mock.calls[0][1].headers).get('x-workspace-token')).toBe('original-workspace-secret'.repeat(3));
 expect(body).toMatchObject({ customBaseUrl: 'https://original.example', customApiKey: 'original-key' });
 const saved = JSON.parse(localStorage.getItem(`ai_assistant_turn_usage:${hook.turnIdRef.current}`)!);
 expect(JSON.stringify(saved)).not.toContain('original-key');
 expect(getUsageLogs()[0]).toMatchObject({ scope: saved.scope, taskId: `text:assistant:${hook.turnIdRef.current}`, promptTokens: 5 });
});
it.each([['manual-retry', 'error'], ['manual-retry', 'EOF'], ['snapshot-read', 'error']])('accounts %s after %s once in the original channel', async (mode, failure) => {
 const hook = useAssistantTurn(); mocks.events = [{ type: 'usage', usage: { prompt_tokens: 5 } }, ...(failure === 'error' ? [{ type: 'error', error: 'delivery lost' }] : [])];
 const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
 try { await expect(hook.runTurn(params())).rejects.toThrow(); } finally { errorLog.mockRestore(); }
 const original = getUsageLogs()[0]; expect(original.promptTokens).toBe(5);
 const turnId = hook.turnIdRef.current!; changeSettings();
 const snapshot = { id: turnId, threadId: 'chat', status: 'completed', modelUsed: 'gpt-6-luna', items: [], usage: { inputTokens: 5, outputTokens: 7 } };
 if (mode === 'manual-retry') {
  const request = vi.fn(async () => Response.json({ success: true, snapshot }));
  expect(await readAssistantRetryDecision(turnId, 'chat', request)).toMatchObject({ kind: 'completed' });
  await readAssistantRetryDecision(turnId, 'chat', request);
  expect(request).toHaveBeenCalledWith(`/api/assistant/turns/${turnId}/snapshot`);
 } else { mocks.snapshot.mockResolvedValue(snapshot); await hook.fetchTurnSnapshot(turnId, vi.fn(), 'chat'); }
 expect(getUsageLogs()).toHaveLength(1);
 expect(getUsageLogs()[0]).toMatchObject({ scope: original.scope, promptTokens: 5, completionTokens: 7, totalTokens: 12 });
 expect(mocks.fetch).toHaveBeenCalledOnce();
});
it('does not dispatch if the immutable accounting scope cannot be saved', async () => {
 vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
 const input = params();
 await expect(useAssistantTurn().runTurn(input)).rejects.toThrow('存储空间');
 expect(input.onTurnPrepared).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
});

it('accounts usage reported only on completion and ignores a mismatched recovery snapshot', async () => {
 const hook = useAssistantTurn(); mocks.events = [{ type: 'turn/completed', turnId: 'unused', usage: { inputTokens: 3, outputTokens: 4 } }];
 await hook.runTurn(params()); const turnId = hook.turnIdRef.current!;
 const request = vi.fn(async () => Response.json({ success: true, snapshot: { id: turnId, threadId: 'foreign', status: 'completed', items: [], usage: { inputTokens: 999, outputTokens: 999 } } }));
 expect(await readAssistantRetryDecision(turnId, 'chat', request)).toMatchObject({ kind: 'blocked' });
 expect(getUsageLogs()).toHaveLength(1); expect(getUsageLogs()[0].totalTokens).toBe(7);
});

it('keeps an original default channel empty when settings are filled during persistence', async () => {
 mocks.credentials = { textProtocol: 'openai' };
 const input = params(); input.onTurnPrepared.mockImplementation(changeSettings);
 mocks.fetch.mockImplementationOnce(async (url, init) => {
  const delivered = withModelRoute(url, init)!;
  expect(JSON.parse(String(delivered.body))).toMatchObject({ customBaseUrl: '', customApiKey: '' });
  return new Response('stream', { headers: { 'content-type': 'text/event-stream' } });
 });
 await useAssistantTurn().runTurn(input);
 expect(getUsageLogs()).toHaveLength(1);
});

it('retains the product widget from a direct collection stream', async () => {
 const widget = { itemId: '10231557417974', platform: 'jd', title: '测试商品', mainImages: ['https://example.com/main.jpg'], detailImages: [], skuImages: [], allImages: ['https://example.com/main.jpg'] };
 mocks.events = [{ type: 'meta', modelUsed: 'direct-collection', productWidget: widget }, { type: 'turn/snapshot', snapshot: { items: [{ id: 'reply', kind: 'agentMessage', content: '商品采集完成', status: 'done' }], modelUsed: 'direct-collection' } }, { type: 'turn/completed' }];
 const state = await useAssistantTurn().runTurn(params());
 expect(state.productWidget).toEqual(widget);
});
