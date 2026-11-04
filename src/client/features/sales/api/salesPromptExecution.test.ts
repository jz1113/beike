import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { apiRequest } from '@client/shared/api/apiRequest';
import { assembleSalesVideoPrompt, normalizeScriptTemplate } from '@shared/domain/sales';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { adaptSalesScriptPlan, submitAndPollSalesVideo } from './salesProduction';

vi.mock('@client/shared/api/apiClient', () => ({
  apiFetch: vi.fn(), readClientStorageConfig: () => ({}), storageConfigHeaders: () => ({}),
}));
vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientHeaders: () => ({}), getMultimodalClientOverrides: () => ({ textProtocol: 'openai' }),
}));
vi.mock('@shared/domain/models/textModelRoute', () => ({ selectedTextModel: () => ({ modelId: 'gpt-4o' }) }));

afterEach(() => { vi.resetAllMocks(); configureDomainRuntime({ storage: null }); });

describe('saved adaptation reaches the actual Mini video submission', () => {
  it.each(['480P', '720P'])('preserves performance, references and explicit %s settings without a default prompt replacement', async (resolution) => {
    const performance = {
      index: 0, subject: '当前人物穿当前开衫', action: '抬臂后回落，保持腕部弯折与手指松垂',
      expression: '抬臂时看镜头浅笑，结束时睁眼并放松嘴角，保留轻微张唇',
      transition: '保持末姿势与镜头距离，不新增前倾或挥手', spokenLine: '', subtitle: '',
    };
    vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, beats: [performance], model: 'gpt-4o', promptVersion: 'plan-adapt:saved-performance-v2',
    })));
    const adapted = await adaptSalesScriptPlan({
      productName: '当前开衫', category: 'fashion', scriptTitle: '连续穿搭展示', oneTake: true,
      voiceMode: 'none', presentationMode: 'clean_visual', personaSummary: '当前人物', sceneSummary: '当前空间',
      beats: [{ index: 0, shotIndex: 0, start: 0, end: 13.8, purpose: 'showcase', shotSize: '中景',
        camera: '固定', refAction: '举手后收势', expression: '看向旧窗后浅笑', transition: '转向旧窗结束',
        requiredView: 'front', assignedView: 'front', imageLabel: '商品图', buyingPoint: '' }],
    }, 'configured-text-route', new AbortController().signal);
    expect(adapted.promptVersion).toBe('plan-adapt:saved-performance-v2');
    expect(adapted.beats[0]).toEqual(performance);

    const script = normalizeScriptTemplate({
      title: '连续展示', durationSec: 13.8, voiceMode: 'none', visualSpec: { oneTake: true },
      shots: [{ start: 0, end: 13.8, beats: [{ start: 0, end: 13.8, action: '举手后收势',
        expression: '看向旧窗后浅笑', transition: '转向旧窗结束' }] }],
    })!;
    const assembled = assembleSalesVideoPrompt({
      finalVideoTemplate: '这是工作区保存的最终规则：仅延续末姿势、呼吸和材质自然回落。\n{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}',
      script, productName: '当前开衫', selectedImages: [{ index: 0, role: 'main', url: '/product.jpg' }],
      beatBindings: [], persona: null, scene: null, customPersonaBodyUrl: '/persona.jpg',
      customSceneImageUrl: '/room.jpg', adaptedBeats: adapted.beats, presentationMode: 'clean_visual',
      imitationMode: 'depth_imitation', scriptVideoReference: { kind: 'depth', url: '/depth.mp4' },
    });
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true, status: 'SUCCESS', resultUrl: '/result.mp4', taskId: 'video-task',
    })));
    await submitAndPollSalesVideo({
      prompt: assembled.enginePrompt, model: 'doubao-seedance-2.0-mini', durationSec: 13.8,
      aspectRatio: '9:16', resolution, refMode: 'omni', generateAudio: false,
      images: assembled.references.filter((slot) => slot.mediaType !== 'video').map((slot) => slot.url),
      videos: assembled.references.filter((slot) => slot.mediaType === 'video').map((slot) => slot.url),
    }, () => {}, new AbortController().signal);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, options] = vi.mocked(apiFetch).mock.calls[0];
    const sent = JSON.parse(String(options?.body));
    expect(path).toBe('/api/generate/video');
    expect(sent).toMatchObject({ model: 'doubao-seedance-2.0-mini', duration: 14,
      aspect_ratio: '9:16', resolution, ref_mode: 'omni', audio: false, videos: ['/depth.mp4'] });
    expect(sent.images).toEqual(expect.arrayContaining(['/persona.jpg', '/product.jpg', '/room.jpg']));
    expect(sent.prompt).toBe(assembled.enginePrompt);
    expect(sent.prompt).toContain(performance.expression);
    expect(sent.prompt).toContain(performance.transition);
    expect(sent.prompt).toContain('仅延续末姿势、呼吸和材质自然回落');
    expect(sent.prompt).not.toContain('旧窗');
    for (const unsupported of ['cfg', 'motion_strength', 'expression_strength', 'camera_fixed']) {
      expect(sent).not.toHaveProperty(unsupported);
    }
  });
});
