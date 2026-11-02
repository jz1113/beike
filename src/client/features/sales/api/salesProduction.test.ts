import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { apiRequest } from '@client/shared/api/apiRequest';
import { getGatewayClientHeaders, getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { pollGenerationTask } from '@client/shared/api/generation/generationApi';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { getModalityStorageKey } from '@shared/domain/models/modalityStorage';
import { assembleSalesVideoPrompt, bindBeatProductImages, normalizeScriptTemplate } from '@shared/domain/sales';
import {
  adaptSalesScriptPlan, fetchSalesStudioAssets, mixSalesFinalVideo, submitAndPollSalesVideo, synthesizeSalesVoiceover,
} from './salesProduction';

vi.mock('@client/shared/api/apiClient', () => ({
  apiFetch: vi.fn(),
  readClientStorageConfig: () => ({}),
  storageConfigHeaders: () => ({}),
}));
vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientHeaders: vi.fn(() => ({})),
  getMultimodalClientOverrides: vi.fn(() => ({ textProtocol: 'openai' })),
}));
vi.mock('@shared/domain/models/textModelRoute', () => ({ selectedTextModel: () => ({ modelId: 'gpt-4o' }) }));
vi.mock('@client/shared/api/generation/generationApi', () => ({ pollGenerationTask: vi.fn() }));
vi.mock('@client/shared/api/generation/generationAbort', () => ({ sleepWhilePolling: vi.fn() }));

afterEach(() => { vi.resetAllMocks(); configureDomainRuntime({ storage: null }); });

describe('sales production APIs', () => {
  it('loads personas, scenes, voices and royalty-free BGMs', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({
      success: true,
      personas: [
        { id: 'p1', name: '若曦', identityUrl: '/original.jpg', fullBodyUrl: '/b.jpg', faceUrl: '/f.jpg', hasReferenceImage: true },
        { id: 'legacy', name: '旧DTO人物', sourceImages: ['/unlabelled-first.jpg'] },
      ],
      scenes: [{ id: 's1', title: '法式客厅' }],
      voices: [{ id: 'v1', name: '温柔女声', ttsVoice: 'female-tianmei' }],
      bgms: [{ id: 'bgm_french_lazy', title: '法式暖阳', audioUrl: '/api/sales/bgm/bgm_french_lazy' }],
    })));
    const catalog = await fetchSalesStudioAssets();
    expect(catalog.personas[0].fullBodyUrl).toBe('/b.jpg');
    expect(catalog.personas[0].identityUrl).toBe('/original.jpg');
    expect(catalog.personas[1].identityUrl).toBeUndefined();
    expect(catalog.bgms[0].id).toBe('bgm_french_lazy');
  });

  it('submits the original persona main with its derived views and matching prompt image numbers', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ success: true,
      personas: [{ id: 'p', name: '当前人物', identityUrl: '/original.jpg', fullBodyUrl: '/derived-front.jpg', faceUrl: '/derived-face.jpg', hasReferenceImage: true }],
    })));
    const catalog = await fetchSalesStudioAssets();
    const script = normalizeScriptTemplate({ durationSec: 5, shots: [{ beats: [{ start: 0, end: 5, actionTemplate: '展示{{商品}}' }] }] })!;
    const selectedImages = [{ index: 0, role: 'main' as const, url: '/product.jpg' }, { index: 1, role: 'main' as const, url: '/product-extra.jpg' }];
    const assembled = assembleSalesVideoPrompt({ script, productName: '上衣', selectedImages, beatBindings: bindBeatProductImages(script, selectedImages), persona: catalog.personas[0], scene: null });
    const images = assembled.references.filter((slot) => slot.mediaType !== 'video').map((slot) => slot.url);
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, status: 'SUCCESS', resultUrl: '/out.mp4' })));
    await submitAndPollSalesVideo({ prompt: assembled.enginePrompt, model: 'doubao-seedance-2.5', durationSec: 5, aspectRatio: '9:16', images, generateAudio: false }, () => {}, new AbortController().signal);
    const request = JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body));
    expect(request.images).toEqual(['/original.jpg', '/derived-front.jpg', '/derived-face.jpg', '/product.jpg', '/product-extra.jpg']);
    expect(request.prompt).toContain('原始人物主图 图片1 为唯一身份依据');
    expect(request.prompt).toContain('图片3 仅补充面部角度与细节');
    expect(request.prompt).toContain('商品外观 图片4、商品外观 图片5');
  });

  it('adapts script beats for current product facts and synthesizes TTS voiceover', async () => {
    vi.mocked(getMultimodalClientOverrides).mockReturnValue({ textProtocol: 'openai', customApiKey: 'k' });
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      beats: [{ index: 0, subject: '模特穿搭', action: '转身展示衣摆', spokenLine: '这件上身很轻盈', subtitle: '上身轻盈' }],
      model: 'gpt-4o',
      promptVersion: 'plan-adapt:v1',
    })));
    const adapted = await adaptSalesScriptPlan({
      productName: '亚麻衬衫',
      category: 'fashion',
      scriptTitle: '室内穿搭',
      oneTake: false,
      visualSpec: { aspectRatio: '9:16', oneTake: false, styleSummary: '手机随拍，保留织物纹理', lighting: '侧窗光，明暗不均', cameraFeel: '固定机位', moodTags: ['松弛'], pacing: 'slow' },
      voiceMode: 'voiceover',
      personaSummary: '若曦',
      sceneSummary: '法式客厅',
      beats: [{ index: 0, shotIndex: 0, start: 0, end: 3, purpose: 'showcase', shotSize: '中景', camera: '固定', refAction: '转身', subject: '人物握住衣摆', scene: '窗边站立', transition: '松手后衣摆回落', expression: '低头查看衣摆', requiredView: 'front', assignedView: 'front', imageLabel: '商品图 #1', buyingPoint: '透气亚麻' }],
    }, 'gpt-route', new AbortController().signal);
    expect(adapted.beats[0].spokenLine).toBe('这件上身很轻盈');
    const request = JSON.parse(String(vi.mocked(apiRequest).mock.calls[0][2]?.body));
    expect(request.visualSpec).toMatchObject({ styleSummary: '手机随拍，保留织物纹理', lighting: '侧窗光，明暗不均', cameraFeel: '固定机位', pacing: 'slow' });
    expect(request.beats[0]).toMatchObject({ subject: '人物握住衣摆', scene: '窗边站立', transition: '松手后衣摆回落', expression: '低头查看衣摆' });

    vi.mocked(getGatewayClientHeaders).mockReturnValue({ 'x-custom-api-key': 'aud' });
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, audioUrl: '/storage/local/vo.mp3', taskId: 'task_aud_1',
    })));
    const vo = await synthesizeSalesVoiceover({ text: '这件上身很轻盈', voice: 'female-tianmei' }, new AbortController().signal);
    expect(vo.audioUrl).toBe('/storage/local/vo.mp3');

    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, videoUrl: '/storage/local/final.mp4', durationSec: 9, duckedBgm: true,
    })));
    const mixed = await mixSalesFinalVideo({
      videoUrl: '/storage/local/raw.mp4', voiceMode: 'voiceover', voiceoverUrl: vo.audioUrl, bgmId: 'bgm_french_lazy',
    }, new AbortController().signal);
    expect(mixed).toMatchObject({ videoUrl: '/storage/local/final.mp4', duckedBgm: true });
  });
});

it('submits depth video references as videos alongside product images', async () => {
  const { submitAndPollSalesVideo } = await import('./salesProduction');
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, status: 'SUCCESS', resultUrl: '/out.mp4' })));
  await submitAndPollSalesVideo({ prompt: '商品参考图片1，动作参考视频1', model: 'doubao-seedance-2.5', durationSec: 5, aspectRatio: '9:16', images: ['/product.jpg'], videos: ['/depth.mp4'], generateAudio: false }, () => {}, new AbortController().signal);
  const request = vi.mocked(apiFetch).mock.calls[0][1] as RequestInit;
  expect(JSON.parse(String(request.body))).toMatchObject({ images: ['/product.jpg'], videos: ['/depth.mp4'], ref_mode: 'omni' });
});

it('rejects unsupported video references before submitting instead of dropping them', async () => {
  const { submitAndPollSalesVideo } = await import('./salesProduction');
  await expect(submitAndPollSalesVideo({ prompt: '动作参考', model: 'veo3.1', durationSec: 8, aspectRatio: '9:16', images: ['/product.jpg'], videos: ['/depth.mp4'], generateAudio: false }, () => {}, new AbortController().signal)).rejects.toThrow('参考视频');
  expect(apiFetch).not.toHaveBeenCalled();
});

describe('video submission preflight and cancellation', () => {
  const input = { prompt: '展示当前商品', model: 'doubao-seedance-2.5', durationSec: 5, aspectRatio: '9:16', images: ['/product.jpg'], generateAudio: false };

  it('submits the chosen generation mode, resolution, ratio and duration unchanged', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, status: 'SUCCESS', resultUrl: '/out.mp4' })));
    await submitAndPollSalesVideo({ ...input, refMode: 'first_frame', resolution: '1080P', aspectRatio: 'adaptive', durationSec: 14 }, () => {}, new AbortController().signal);
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toMatchObject({ ref_mode: 'first_frame', resolution: '1080P', aspect_ratio: 'adaptive', duration: 14, images: input.images });
  });

  it.each([['/product.jpg'], ['/person.jpg', '/product.jpg']])('keeps identity/product references in omni mode: %j', async (...images) => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, status: 'SUCCESS', resultUrl: '/out.mp4' })));
    await submitAndPollSalesVideo({ ...input, images }, () => {}, new AbortController().signal);
    const request = vi.mocked(apiFetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ ref_mode: 'omni', images });
  });

  it.each([
    { model: 'veo3.1', durationSec: 8, images: ['/1.jpg', '/2.jpg', '/3.jpg', '/4.jpg'] },
    { model: 'veo3.1', durationSec: 30 },
    { aspectRatio: '7:3' },
  ])('rejects incompatible image counts, durations and ratios before a paid request: %j', async (patch) => {
    await expect(submitAndPollSalesVideo({ ...input, ...patch }, () => {}, new AbortController().signal)).rejects.toThrow('当前');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('does not return a finished video after polling was canceled', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, taskId: 'pending', status: 'PENDING' })));
    let finish!: (value: Awaited<ReturnType<typeof pollGenerationTask>>) => void;
    vi.mocked(pollGenerationTask).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const controller = new AbortController();
    const run = submitAndPollSalesVideo(input, () => {}, controller.signal);
    const rejected = expect(run).rejects.toThrow();
    await vi.waitFor(() => expect(pollGenerationTask).toHaveBeenCalledTimes(1));
    controller.abort();
    finish({ success: true, status: 'SUCCESS', resultUrl: '/late.mp4' });
    await rejected;
  });

  it('does not submit an already canceled request', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(submitAndPollSalesVideo(input, () => {}, controller.signal)).rejects.toThrow();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('keeps the chosen channel for submit and poll while sending the upstream model ID', async () => {
    const store = new Map([[getModalityStorageKey('video'), JSON.stringify([
      { id: 'route-a', modelId: input.model, name: '渠道 A', channelId: 'a' },
      { id: 'route-b', modelId: input.model, name: '渠道 B', channelId: 'b' },
    ])]]);
    configureDomainRuntime({ storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); }, removeItem: (key) => { store.delete(key); } } });
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, taskId: 'route-task', status: 'PENDING' })));
    vi.mocked(pollGenerationTask).mockResolvedValue({ success: true, status: 'SUCCESS', resultUrl: '/out.mp4' });
    const signal = new AbortController().signal;
    await submitAndPollSalesVideo({ ...input, model: 'route-b' }, () => {}, signal);
    expect(getGatewayClientHeaders).toHaveBeenCalledWith('route-b');
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toMatchObject({ model: input.model, ref_mode: 'omni' });
    expect(pollGenerationTask).toHaveBeenCalledWith('route-task', 'video', input.model, { modelSelection: 'route-b', signal });
  });

  it('uses the selected voice channel and the actual speech model separately', async () => {
    const store = new Map([[getModalityStorageKey('voice'), JSON.stringify([
      { id: 'voice-route', modelId: 'speech-2.8-hd', name: '配音渠道', channelId: 'voice-provider' },
    ])]]);
    configureDomainRuntime({ storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); }, removeItem: (key) => { store.delete(key); } } });
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, audioUrl: '/voice.mp3', taskId: 'voice-task' })));
    await synthesizeSalesVoiceover({ text: '当前商品介绍', voice: 'female', model: 'voice-route' }, new AbortController().signal);
    expect(getGatewayClientHeaders).toHaveBeenCalledWith('voice-route');
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toMatchObject({ model: 'speech-2.8-hd' });
  });
});

describe('sales video poll recovery', () => {
  const input = { prompt: '展示商品', model: 'doubao-seedance-2.5', durationSec: 5, aspectRatio: '9:16', images: ['/product.jpg'], generateAudio: false };
  const submitted = () => vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, taskId: 'original-task', status: 'PENDING' })));

  it('surfaces a permanent query error immediately with the original task, without resubmitting', async () => {
    submitted();
    vi.mocked(pollGenerationTask).mockRejectedValue(new Error('轮询失败 (403)'));
    await expect(submitAndPollSalesVideo(input, () => {}, new AbortController().signal)).rejects.toThrow('任务 original-task');
    expect(pollGenerationTask).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('recovers from a temporary query failure using the same task', async () => {
    submitted();
    vi.mocked(pollGenerationTask).mockRejectedValueOnce(new Error('轮询失败 (503)')).mockResolvedValueOnce({ status: 'SUCCESS', resultUrl: '/done.mp4' });
    const progress = vi.fn();
    await expect(submitAndPollSalesVideo(input, progress, new AbortController().signal)).resolves.toEqual({ videoUrl: '/done.mp4', taskId: 'original-task' });
    expect(progress).toHaveBeenCalledWith(expect.stringContaining('正在重试'));
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('stops repeated network failures with actionable recovery information', async () => {
    submitted();
    vi.mocked(pollGenerationTask).mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(submitAndPollSalesVideo(input, () => {}, new AbortController().signal)).rejects.toThrow('避免重复提交');
    expect(pollGenerationTask).toHaveBeenCalledTimes(3);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
