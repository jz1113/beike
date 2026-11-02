import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { listSalesPrompts, SalesPromptRequestError, saveSalesPrompt } from './salesPrompts';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const prompt = { id: 'summary', title: '卖点提炼', description: '整理商品买点', prompt: '当前要求', defaultPrompt: '默认要求', version: 'v2', customized: true };

it('reads effective prompts and defaults from the authenticated API', async () => {
  const abort = new AbortController();
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, prompts: [prompt] })));
  expect(await listSalesPrompts(abort.signal)).toEqual([prompt]);
  expect(apiFetch).toHaveBeenCalledWith('/api/sales/prompts', expect.objectContaining({ method: 'GET', signal: abort.signal, cache: 'no-store' }));
});

it('sends the edited text and the version being edited without transforming line breaks', async () => {
  const text = '第一行\n{{商品}}\nJSON 格式';
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, prompt: { ...prompt, prompt: text } })));
  await saveSalesPrompt('summary', text, 'v1');
  const [, options] = vi.mocked(apiFetch).mock.calls[0];
  expect(JSON.parse(String((options as RequestInit).body))).toEqual({ prompt: text, expectedVersion: 'v1' });
});

it('rejects a successful response that returns a default or a different prompt instead of the saved edit', async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, prompt })));
  await expect(saveSalesPrompt('summary', '本次修改', 'v1')).rejects.toThrow('与本次保存不一致');
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, prompt: { ...prompt, id: 'plan-adapt', prompt: '本次修改' } })));
  await expect(saveSalesPrompt('summary', '本次修改', 'v1')).rejects.toThrow('与本次保存不一致');
});

it('preserves conflict status and rejects unsuccessful or malformed responses', async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: '提示词已被更新' }), { status: 409 }));
  await expect(saveSalesPrompt('summary', '编辑内容', 'v1')).rejects.toMatchObject({ message: '提示词已被更新', status: 409 });
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: false, prompts: [] })));
  await expect(listSalesPrompts()).rejects.toThrow();
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
  await expect(listSalesPrompts()).rejects.toBeInstanceOf(SalesPromptRequestError);
});
