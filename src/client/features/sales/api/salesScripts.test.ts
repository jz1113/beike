import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@client/shared/api/apiRequest';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { readAssistantReasoningEffort } from '@client/shared/hooks/useAssistantReasoning';
import {
  analyzeReferenceVideo, fetchSalesScript, fetchScriptAnalysisPrompt, listSalesScripts,
  patchSalesScript, saveSalesScript, uploadScriptVideo,
} from './salesScripts';

vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getMultimodalClientOverrides: vi.fn() }));
vi.mock('@client/shared/hooks/useAssistantReasoning', () => ({ readAssistantReasoningEffort: vi.fn(() => 'medium') }));
vi.mock('@shared/domain/models/textModelRoute', () => ({ selectedTextModel: () => ({ modelId: 'gemini-2.5-pro' }) }));

afterEach(() => vi.resetAllMocks());

const sampleScript = {
  title: '法式室内五切镜穿搭',
  durationSec: 9,
  format: 'presenter',
  voiceMode: 'voiceover',
  shots: [
    { start: 0, end: 2, summary: '桌前定场', beats: [{ start: 0, end: 2, actionTemplate: '桌前抬眸看镜头', requiredView: 'front' }] },
    { start: 2, end: 9, summary: '转身展示背部', beats: [{ start: 2, end: 9, actionTemplate: '转身展示{{商品背部设计}}', requiredView: 'back' }] },
  ],
  sourceExclusions: [{ type: 'accessory', term: '黑色菱格纹链条包', replacementRule: '剔除' }],
};

describe('sales reference script API', () => {
  it('reads an exact saved receipt without rewriting later user edits and distinguishes missing records from service failures', async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, item: { id: 'script_saved', title: '已改名', status: 'verified', script: sampleScript } })));
    await expect(fetchSalesScript('script_saved', signal)).resolves.toMatchObject({ id: 'script_saved', title: '已改名', status: 'verified' });
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/sales/scripts', { search: 'id=script_saved', signal, cache: 'no-store' });
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: '参考脚本不存在' }), { status: 404 }));
    await expect(fetchSalesScript('missing')).resolves.toBeNull();
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(fetchSalesScript('saved')).rejects.toThrow('重新启动贝壳服务');
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ error: '暂不可用' }), { status: 500 }));
    await expect(fetchSalesScript('saved')).rejects.toThrow('暂不可用');
  });
  it('bypasses browser cache when reading the active analysis prompt', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ success: true, prompt: '保存后的规则', promptVersion: 'reference-script:latest' })));
    const signal = new AbortController().signal;
    await expect(fetchScriptAnalysisPrompt(signal)).resolves.toMatchObject({ promptVersion: 'reference-script:latest' });
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/sales/script-analysis/prompt', { signal, cache: 'no-store' });
  });
  it('uploads reference videos and returns measured probe metadata', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({
      success: true, videoUrl: '/storage/local/ref.mp4', videoHash: 'abc123', durationSec: 9.2, aspectRatio: '9:16', hasAudio: true, sizeBytes: 1024,
    })));
    const file = new File(['video'], 'ref.mp4', { type: 'video/mp4' });
    const uploaded = await uploadScriptVideo(file);
    expect(uploaded).toMatchObject({ videoUrl: '/storage/local/ref.mp4', durationSec: 9.2, aspectRatio: '9:16' });
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/sales/script-video', expect.objectContaining({ method: 'POST' }));
  });

  it('forwards Gemini channel credentials and reasoning effort on video analysis and normalizes legacy fields', async () => {
    vi.mocked(getMultimodalClientOverrides).mockReturnValue({ textProtocol: 'gemini', customBaseUrl: 'https://gemini.test', customApiKey: 'g-key' });
    vi.mocked(readAssistantReasoningEffort).mockReturnValue('high');
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({
      success: true, script: sampleScript, model: 'gemini-2.5-pro', promptVersion: 'reference-script:v3', videoHash: 'hash1',
    })));
    const draft = await analyzeReferenceVideo('/storage/local/ref.mp4', 'gemini-route', new AbortController().signal);
    expect(draft.script.assetSlots.productViews).toEqual(['front', 'back']);
    expect(draft.script.visualSpec.oneTake).toBe(false);
    const body = JSON.parse(vi.mocked(apiRequest).mock.calls[0][2]?.body as string);
    expect(body).toMatchObject({
      videoUrl: '/storage/local/ref.mp4',
      model: 'gemini-2.5-pro',
      textProtocol: 'gemini',
      customApiKey: 'g-key',
      reasoningEffort: 'high',
    });
  });

  it('lists, saves, and patches stored reference scripts while explaining outdated servers', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, items: [{ id: 'script_1', title: '法式室内', durationSec: 9, status: 'verified', version: 2, useCount: 3, script: sampleScript }],
    })));
    const list = await listSalesScripts();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'script_1', status: 'verified', useCount: 3, analysisCacheEligible: true });

    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, item: { id: 'script_2', title: list[0].script.title, durationSec: 9, status: 'draft', script: list[0].script },
    })));
    const saved = await saveSalesScript({ videoUrl: '/storage/local/ref.mp4', videoHash: 'h', status: 'draft', model: 'm', promptVersion: 'v', script: list[0].script });
    expect(saved.id).toBe('script_2');

    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, item: { id: 'script_2', title: list[0].script.title, durationSec: 9, status: 'verified', useCount: 1, script: list[0].script },
    })));
    const patched = await patchSalesScript('script_2', { status: 'verified', recordUse: true });
    expect(patched.status).toBe('verified');

    vi.mocked(apiRequest).mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(listSalesScripts()).rejects.toThrow('重新启动贝壳服务');
  });
  it.each(['expression', 'transition'])('keeps old scripts readable but rejects raw malformed %s for local cache reuse', async (field) => {
    const invalid = structuredClone(sampleScript);
    Object.assign(invalid.shots[0].beats[0], { [field]: ['浅笑', '回落'] });
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, items: [{ id: 'old-script', status: 'verified', script: invalid, promptVersion: 'current' }],
    })));
    const [stored] = await listSalesScripts();
    expect(stored).toMatchObject({ id: 'old-script', status: 'verified', promptVersion: 'current', analysisCacheEligible: false });
    expect(stored.script.shots[0].beats[0]).toMatchObject({ [field]: '' });
  });
  it('round-trips linked video fields without overwriting script contents', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, item: { id: 'script_linked', status: 'verified', script: sampleScript,
        videoUrl: '/storage/source.mp4', depthVideoUrl: '/storage/depth.mp4', depthTaskId: 'depth-task', depthOperationId: 'depth-op' },
    })));
    const saved = await patchSalesScript('script_linked', {
      videoUrl: '/storage/source.mp4', depthVideoUrl: '/storage/depth.mp4', depthTaskId: 'depth-task', depthOperationId: 'depth-op',
    });
    expect(saved).toMatchObject({ videoUrl: '/storage/source.mp4', depthVideoUrl: '/storage/depth.mp4', depthTaskId: 'depth-task', depthOperationId: 'depth-op' });
    const body = JSON.parse(vi.mocked(apiRequest).mock.calls[0][2]?.body as string);
    expect(body.script).toBeUndefined();
    expect(body.status).toBeUndefined();
    expect(body.depthVideoUrl).toBe('/storage/depth.mp4');
  });

});
