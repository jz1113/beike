import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@client/shared/api/apiRequest';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import type { SalesSpokenCopyInput } from '@shared/contracts/salesSpokenCopy';
import { adaptSalesSpokenCopy, SalesSpokenCopyRequestError } from './salesSpokenCopy';

vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getMultimodalClientOverrides: vi.fn(() => ({ textProtocol: 'openai' })) }));
vi.mock('@shared/domain/models/textModelRoute', () => ({ selectedTextModel: vi.fn(() => ({ modelId: 'configured-upstream' })) }));

const input: SalesSpokenCopyInput = {
  sourceCopy: '  人工修改的推荐文案\n第二行保留。 ', productName: '条纹上衣', facts: '装饰扣',
  buyingPoints: ['搭配纯色'], voiceMode: 'speech', duration: 6.3, targetCps: 3.8,
  beats: [0, 1].map((index) => ({ index, start: index * 3, end: (index + 1) * 3,
    shotIndex: 0, shotSize: index === 0 ? '中景' : '近景', camera: '固定拍摄胸部',
    requiredView: 'detail', assignedView: 'front', subject: '当前人物与条纹上衣',
    action: '抬手展示', purpose: index === 0 ? 'hook' : 'showcase', buyingPoint: '搭配纯色', spokenLine: '原台词', subtitle: '原字幕' })),
};
const data = { success: true, beats: [
  { index: 1, spokenLine: '搭纯色下装', subtitle: '搭纯色' },
  { index: 0, spokenLine: '咖啡条纹', subtitle: '看条纹' },
], model: 'configured-upstream', promptVersion: 'spoken-copy:saved', reviewPromptVersion: 'spoken-review:saved' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMultimodalClientOverrides).mockReturnValue({ textProtocol: 'openai' });
  vi.mocked(selectedTextModel).mockReturnValue({ modelId: 'configured-upstream' } as ReturnType<typeof selectedTextModel>);
  vi.mocked(apiRequest).mockResolvedValue(response(data));
});

describe('timed spoken copy API', () => {
  it('accepts an independent manual review without inventing a writing prompt version', async () => {
    vi.mocked(apiRequest).mockResolvedValue(response({ ...data, promptVersion: '' }));
    const result = await adaptSalesSpokenCopy({ ...input, reviewOnly: true }, 'channel:model', new AbortController().signal);
    expect(result.promptVersion).toBe('');
    expect(result.reviewPromptVersion).toBe(data.reviewPromptVersion);
    expect(JSON.parse(String(vi.mocked(apiRequest).mock.calls[0][2]?.body)).reviewOnly).toBe(true);
  });
  it.each(['speech', 'voiceover'] as const)('transports %s timing, exact recommendation, route credentials and cancellation signal', async (voiceMode) => {
    const abort = new AbortController();
    const routing = { textProtocol: 'openai' as const, customBaseUrl: 'https://text.example.test/v1',
      customApiKey: 'test-model-key', apiFormat: 'openai-responses' as const, allowInsecureHttp: false };
    vi.mocked(getMultimodalClientOverrides).mockReturnValue(routing);
    expect(await adaptSalesSpokenCopy({ ...input, voiceMode }, 'channel:model', abort.signal)).toEqual(data);
    expect(selectedTextModel).toHaveBeenCalledWith('channel:model');
    expect(getMultimodalClientOverrides).toHaveBeenCalledWith('channel:model');
    const [method, path, options] = vi.mocked(apiRequest).mock.calls[0];
    expect([method, path]).toEqual(['POST', '/api/sales/spoken-copy']);
    expect(options).toMatchObject({ signal: abort.signal, headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(options?.body))).toEqual({ ...input, voiceMode, summary: '', cautions: [],
      model: 'configured-upstream', ...routing });
  });

  it('preserves the official DeepSeek route and an explicitly cleared recommendation', async () => {
    await adaptSalesSpokenCopy({ ...input, sourceCopy: '' }, 'deepseek-official:deepseek-chat', new AbortController().signal);
    const body = JSON.parse(String(vi.mocked(apiRequest).mock.calls[0][2]?.body));
    expect(body).toMatchObject({ sourceCopy: '', model: 'deepseek-official:deepseek-chat' });
    expect(selectedTextModel).not.toHaveBeenCalled();
  });

  it.each([
    { ...data, beats: [data.beats[0]] },
    { ...data, beats: [data.beats[0], data.beats[0]] },
    { ...data, beats: [data.beats[0], { ...data.beats[1], index: 8 }] },
  ])('rejects missing, duplicate or foreign response indexes', async (invalid) => {
    vi.mocked(apiRequest).mockResolvedValue(response(invalid));
    await expect(adaptSalesSpokenCopy(input, 'channel:model', new AbortController().signal)).rejects.toThrow('编号不匹配');
  });

  it.each([
    { ...data, beats: [{ index: 0, spokenLine: '缺字幕' }] },
    { ...data, promptVersion: '' },
    { ...data, reviewPromptVersion: '' },
    { ...data, reviewPromptVersion: undefined },
    { ...data, beats: [] },
  ])('rejects an incomplete successful response', async (invalid) => {
    vi.mocked(apiRequest).mockResolvedValue(response(invalid));
    await expect(adaptSalesSpokenCopy(input, 'channel:model', new AbortController().signal)).rejects.toThrow('结构不完整');
  });

  it('surfaces server failure without accepting returned beats', async () => {
    vi.mocked(apiRequest).mockResolvedValue(response({ ...data, success: false, error: '台词超过本段时长' }, 502));
    await expect(adaptSalesSpokenCopy(input, 'channel:model', new AbortController().signal)).rejects.toThrow('台词超过本段时长');
    vi.mocked(apiRequest).mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(adaptSalesSpokenCopy(input, 'channel:model', new AbortController().signal)).rejects.toThrow('HTTP 503');
  });

  it('exposes an unapproved draft only as recovery data on review transport failure', async () => {
    const pendingReview = { beats: data.beats, promptVersion: data.promptVersion };
    vi.mocked(apiRequest).mockResolvedValue(response({ success: false, error: '验收超时', code: 'summary_timeout',
      stage: 'review', pendingReview }, 502));
    const error = await adaptSalesSpokenCopy(input, 'channel:model', new AbortController().signal).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(SalesSpokenCopyRequestError);
    expect(error).toMatchObject({ message: '验收超时', code: 'summary_timeout', pendingReview });
  });

  it.each([
    { beats: [data.beats[0]], promptVersion: data.promptVersion },
    { beats: [data.beats[0], data.beats[0]], promptVersion: data.promptVersion },
    { beats: [data.beats[0], { ...data.beats[1], index: 8 }], promptVersion: data.promptVersion },
    { beats: [data.beats[0], { ...data.beats[1], index: -1 }], promptVersion: data.promptVersion },
    { beats: [data.beats[0], { index: 0, spokenLine: '缺字幕' }], promptVersion: data.promptVersion },
    { beats: [data.beats[0], { ...data.beats[1], spokenLine: 100 }], promptVersion: data.promptVersion },
    { beats: data.beats, promptVersion: ' ' },
    { beats: data.beats },
    null,
  ])('does not cache malformed or mismatched pending review data: %j', async (pendingReview) => {
    vi.mocked(apiRequest).mockResolvedValue(response({ success: false, error: '验收失败', stage: 'review', pendingReview }, 502));
    await expect(adaptSalesSpokenCopy(input, 'channel:model', new AbortController().signal))
      .rejects.toMatchObject({ name: 'SalesSpokenCopyRequestError', pendingReview: undefined });
  });

  it.each([
    { status: 400, stage: 'review', reviewOnly: false },
    { status: 422, stage: 'review', reviewOnly: false },
    { status: 503, stage: 'review', reviewOnly: false },
    { status: 502, stage: 'rewrite', reviewOnly: false },
    { status: 502, stage: 'review', reviewOnly: true },
  ])('does not accept a new pending draft from the wrong failure path: %j', async ({ status, stage, reviewOnly }) => {
    vi.mocked(apiRequest).mockResolvedValue(response({ success: false, error: '失败', stage,
      pendingReview: { beats: data.beats, promptVersion: data.promptVersion } }, status));
    await expect(adaptSalesSpokenCopy({ ...input, reviewOnly }, 'channel:model', new AbortController().signal))
      .rejects.toMatchObject({ pendingReview: undefined });
  });

  it('does not submit when already cancelled and rejects a response arriving after cancellation', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(adaptSalesSpokenCopy(input, 'channel:model', abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(apiRequest).not.toHaveBeenCalled();
    const pending = new AbortController();
    vi.mocked(apiRequest).mockImplementation(async () => { pending.abort(); return response(data); });
    await expect(adaptSalesSpokenCopy(input, 'channel:model', pending.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates cancellation while the request is in flight', async () => {
    const abort = new AbortController();
    vi.mocked(apiRequest).mockImplementation(async (_method, _path, options) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    }));
    const pending = adaptSalesSpokenCopy(input, 'channel:model', abort.signal);
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
