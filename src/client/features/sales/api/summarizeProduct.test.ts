import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@client/shared/api/apiRequest';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { summarizeProduct } from './summarizeProduct';

vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getMultimodalClientOverrides: vi.fn() }));
vi.mock('@shared/domain/models/textModelRoute', () => ({ selectedTextModel: () => ({ modelId: 'actual-vision' }) }));
afterEach(() => vi.resetAllMocks());
const input = { textSources: [{ index: 0, text: '当前 OCR 文字' }] };
describe('product selling points model API', () => {
  it('keeps the selected channel credentials, native protocol, Responses and cancellation', async () => {
    vi.mocked(getMultimodalClientOverrides).mockReturnValue({ customBaseUrl: 'https://chosen.test', customApiKey: 'chosen', textProtocol: 'anthropic', apiFormat: 'openai-responses' });
    const data = { success: true, result: { summary: '看不清商品', points: [], copy: '', copyPointIndexes: [], conflicts: [], questions: ['补充清晰正面图'], cautions: [] }, model: 'actual-vision', skillVersion: 'v1' };
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(data)));
    const signal = new AbortController().signal;
    expect(await summarizeProduct(input, 'chosen-route', signal)).toEqual(data);
    expect(getMultimodalClientOverrides).toHaveBeenCalledWith('chosen-route');
    const options = vi.mocked(apiRequest).mock.calls[0][2]!;
    expect(options.signal).toBe(signal);
    expect(JSON.parse(options.body as string)).toMatchObject({ model: 'actual-vision', customApiKey: 'chosen', textProtocol: 'anthropic', apiFormat: 'openai-responses' });
  });
  it('strips legacy images, URLs, product metadata and supplementary text before sending', async () => {
    const legacy = { ...input, textSources: input.textSources.map((source) => ({ ...source, url: '/storage/private.png' })), productName: '商品名称', brand: '品牌', facts: '补充资料', referenceImages: [{ index: 0, url: '/storage/private.png' }], textImages: [{ index: 0, url: '/storage/private.png', text: '旧输入' }] };
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ error: 'mock failure' }), { status: 400 }));
    await expect(summarizeProduct(legacy, 'text-model', new AbortController().signal)).rejects.toThrow('mock failure');
    const sent = JSON.parse(vi.mocked(apiRequest).mock.calls[0][2]!.body as string);
    expect(sent).toEqual({ ...input, model: 'actual-vision' });
    expect(JSON.stringify(sent)).not.toContain('/storage/');
  });
  it('does not send empty OCR input even when product metadata exists', async () => {
    await expect(summarizeProduct({ textSources: [] }, 'text-model', new AbortController().signal)).rejects.toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('surfaces errors without substituting fabricated copy or making automatic retries', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ error: '余额不足' }), { status: 429 }));
    await expect(summarizeProduct(input, 'vision', new AbortController().signal)).rejects.toThrow('余额不足');
    expect(apiRequest).toHaveBeenCalledTimes(1);
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ success: true, result: {} })));
    await expect(summarizeProduct(input, 'vision', new AbortController().signal)).rejects.toThrow('不完整');
  });
  it('explains an outdated backend instead of showing a generic missing endpoint', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ error: '接口不存在' }), { status: 404 }));
    await expect(summarizeProduct(input, 'vision', new AbortController().signal)).rejects.toThrow('重新启动贝壳服务');
  });
});
