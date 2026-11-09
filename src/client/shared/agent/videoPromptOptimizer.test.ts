import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { optimizeVideoPrompt } from './videoPromptOptimizer';
import { videoPromptOutput } from './videoPromptOutput';
import { apiFetch } from '@client/shared/api/apiClient';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { modalityPickerSelections } from '@shared/domain/models/modalityStorage';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import { createUsageScope } from '@client/shared/utils/usageScope';
import { clearUsageLogs, getUsageLogs } from '@client/shared/utils/usageTracker';
import { videoPromptSkill } from '@shared/domain/assistant/skills/videoPromptSkills';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getMultimodalClientOverrides: vi.fn(() => ({ customApiKey: 'test-key', customBaseUrl: 'https://original.test' })),
  getGatewayClientHeaders: () => ({}),
}));
vi.mock('@client/shared/utils/modelUsage', async importOriginal => {
  const actual = await importOriginal<typeof import('@client/shared/utils/modelUsage')>();
  return {
    ...actual,
    recordChatTokens: vi.fn(actual.recordChatTokens),
  };
});
vi.mock('@client/store', () => ({ useAppStore: { getState: () => ({ assistantModel: 'chat-b' }) } }));
vi.mock('@shared/domain/models/modalityStorage', () => ({ modalityPickerSelections: vi.fn() }));
vi.mock('@shared/domain/models/workflowModels', () => ({
  getEnabledMultimodalModelsFromSettings: () => [],
  readWorkflowModelsFromStorage: () => ({}),
}));

const input = { model: 'wan3.0-video', prompt: '一只猫奔跑', mode: 'omni', duration: 5, images: 0, videos: 0 };
const context = () => ({ projectId: 'project', nodeId: 'node', stage: 'video' as const, inputKey: 'binding', runId: crypto.randomUUID() });
const signal = () => new AbortController().signal;
const response = (content: unknown, finish_reason = 'stop') =>
  Response.json({ choices: [{ message: { content }, finish_reason }], usage: { total_tokens: 20 } });

beforeEach(() => {
  const rows = new Map<string, string>();
  vi.stubGlobal('window', { addEventListener: () => {}, dispatchEvent: () => true });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => rows.set(k, v),
    removeItem: (k: string) => rows.delete(k),
    key: (i: number) => [...rows.keys()][i] ?? null,
    get length() { return rows.size; },
  });
  const queues = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', {
    locks: {
      request: (key: string, _o: unknown, fn: () => unknown) => {
        const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(fn);
        queues.set(key, next);
        return next;
      },
    },
  });
  vi.clearAllMocks();
  vi.mocked(getMultimodalClientOverrides).mockReturnValue({ customApiKey: 'test-key' });
  vi.mocked(modalityPickerSelections).mockReturnValue([
    { id: 'chat-a', entryId: 'chat-a', name: 'A', modelId: 'upstream-a' },
    { id: 'chat-b', entryId: 'chat-b', name: 'B', modelId: 'upstream-b' },
  ]);
  vi.mocked(apiFetch).mockResolvedValue(response('【核心任务】一只猫奔跑'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('video prompt optimization preflight', () => {
  it.each(['minimax-h3', 'doubao-seedance-2.0', 'doubao-seedance-2.5-pro', 'wan3.0-video'])('sends the actual %s Skill to the text model', async model => {
    const skill = videoPromptSkill(model)!;
    expect(await optimizeVideoPrompt({ ...input, model }, signal(), context())).toHaveProperty('skillId', skill.id);
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
    expect(body.messages[0].content).toContain(skill.prompt);
    expect(JSON.parse(body.messages[1].content).model).toBe(model);
  });

  it('uses the selected enabled text route and returns a traceable optimization without changing the original', async () => {
    const result = await optimizeVideoPrompt(input, signal(), context());
    expect(result).toMatchObject({ original: input.prompt, optimized: '【核心任务】一只猫奔跑', skillId: 'wan3-pe', textModel: 'chat-b', revision: '0.2.0' });
    const [url, options] = vi.mocked(apiFetch).mock.calls[0];
    expect(url).toBe('/api/generate/canvas-text');
    const body = JSON.parse(options!.body as string);
    expect(body).toMatchObject({ model: 'chat-b', customApiKey: 'test-key' });
    expect(body.tools).toBeUndefined();
    expect(recordChatTokens).toHaveBeenLastCalledWith(expect.objectContaining({ modelId: 'chat-b', success: true, operationId: expect.any(String) }));
    expect(input.prompt).toBe('一只猫奔跑');
  });

  it('uses the canvas node model and its upstream ID instead of the assistant default', async () => {
    const result = await optimizeVideoPrompt(input, signal(), { ...context(), stage: 'compiler', textModel: 'chat-a' });
    expect(result).toMatchObject({ textModel: 'chat-a', videoModel: input.model });
    expect(JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string)).toMatchObject({ model: 'upstream-a' });
  });

  it('skips unsupported models without making a text request', async () => {
    expect(await optimizeVideoPrompt({ ...input, model: 'kling-v3' }, signal(), context())).toBeUndefined();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('extracts the executable prompt from the Seedance report without submitting review sections', async () => {
    vi.mocked(apiFetch).mockResolvedValue(response('# 优化后提示词\n@图片1作为外观参考。0–2秒抬头，2–5秒微笑。全程静音。\n\n# 优化问题\n已调整结构。\n# 相关原则\n镜头连贯。'));
    const result = await optimizeVideoPrompt({ ...input, model: 'doubao-seedance-2.0-mini' }, signal(), context());
    expect(result?.optimized).toBe('@图片1作为外观参考。0–2秒抬头，2–5秒微笑。全程静音。');
  });

  it('rejects a report with no executable prompt', async () => {
    vi.mocked(apiFetch).mockResolvedValue(response('# 优化后提示词\n\n# 优化问题\n无法处理'));
    await expect(optimizeVideoPrompt(input, signal(), context())).rejects.toThrow('优化稿为空');
  });

  it('requires an enabled text model', async () => {
    vi.mocked(modalityPickerSelections).mockReturnValue([]);
    await expect(optimizeVideoPrompt(input, signal(), context())).rejects.toThrow('需要文本模型');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it.each([['', 'stop'], ['partial', 'length'], [null, 'stop'], ['x'.repeat(20_001), 'stop']])('rejects unusable output', async (content, reason) => {
    vi.mocked(apiFetch).mockResolvedValue(response(content, reason));
    await expect(optimizeVideoPrompt(input, signal(), context())).rejects.toThrow();
  });

  it('propagates failures and does not fall back to submitting the original', async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ error: '上游繁忙' }, { status: 502 }));
    await expect(optimizeVideoPrompt(input, signal(), context())).rejects.toThrow('上游繁忙');
  });

  it('rejects a late result after cancellation', async () => {
    const controller = new AbortController();
    vi.mocked(apiFetch).mockImplementation(async () => {
      controller.abort();
      return response('迟到稿');
    });
    await expect(optimizeVideoPrompt(input, controller.signal, context())).rejects.toThrow();
  });
});

const outputInput = {
  model: 'doubao-seedance-2.0-mini',
  scriptOnly: true,
  duration: 5,
  audio: false,
  images: 1,
  videos: 0,
  prompt: '图片1只约束外观\n本地时间轴：\n0–2秒：闭目仰头\n2–5秒：睁眼微笑\n结束状态：手搭门襟\n声音：全程静音',
};

describe('videoPromptOutput', () => {
  it('extracts the generation body and restores exact timeline, duration and silence after vendor report output', () => {
    const result = videoPromptOutput('# 优化后提示词\n参考 @图片1，人物先仰头，再微笑。\n\n---\n\n# 优化问题\n删除了绝对秒数\n# 相关原则\n输出说明', outputInput);
    expect(result).toContain('参考 @图片1');
    for (const text of ['视频总时长：5秒', '0–2秒：闭目仰头', '2–5秒：睁眼微笑', '结束状态：手搭门襟', '全程静音，无台词、音乐、环境声或音效']) {
      expect(result).toContain(text);
    }
    for (const text of ['优化问题', '相关原则', '删除了绝对秒数', '优化后提示词']) {
      expect(result).not.toContain(text);
    }
  });

  it('retains confirmed dialogue for generated audio and rejects missing timelines', () => {
    expect(videoPromptOutput('人物微笑', { ...outputInput, audio: true, prompt: outputInput.prompt.replace('声音：全程静音', '声音：人物说“你好”，无音乐') })).toContain('人物说“你好”，无音乐');
    expect(() => videoPromptOutput('人物微笑', { ...outputInput, prompt: '无分镜' })).toThrow('时间轴');
  });

  it('does not duplicate mandatory execution constraints when confirming the official optimized draft', () => {
    const first = videoPromptOutput('人物按分镜动作执行', outputInput);
    expect(videoPromptOutput(first, outputInput)).toBe(first);
  });

  it('rejects the conflicting wood table draft and protects the entire selected sofa script', () => {
    const sofa = {
      ...outputInput,
      duration: 15,
      prompt: '【文本1 · 已连接文本（提取后）】\n【全片一致性】\n圆框眼镜；沙发、画框、地毯；正面漫射柔光。\n【本次片段｜时长 15 秒】\n开场画面：居中站立。\n本地时间轴：\n0–15秒：站在沙发旁整理袖口。\n结束状态：双手回到身侧。\n声音：全程静音。\n【素材职责】\n@图片1：仅参考人物身份。\n【素材职责结束】',
    };
    const clean = sofa.prompt.split('\n').slice(1).join('\n');
    expect(videoPromptOutput(clean, sofa)).toBe(clean);
    for (const bad of [
      clean + '\n0–15秒：趴在木桌上，百叶窗硬光。',
      ...['圆框眼镜', '沙发、画框、地毯', '正面漫射柔光', '开场画面：居中站立。', '@图片1：仅参考人物身份。'].map(value => clean.replace(value, '')),
      clean.replace('漫射柔光', '百叶窗硬光'),
    ]) {
      expect(() => videoPromptOutput(bad, sofa)).toThrow(/缺失或冲突/);
    }
  });
});

describe('videoPromptUsage', () => {
  const usageInput = { model: 'wan3.0-video', prompt: 'original', images: 0, videos: 0 };
  const usageContext = { projectId: 'project', nodeId: 'node', stage: 'compiler' as const, runId: 'original', inputKey: 'binding' };
  const usageResult = () => Response.json({ operationKey: 'original', choices: [{ finish_reason: 'stop', message: { content: 'optimized' } }], usage: { total_tokens: 7 } });

  beforeEach(() => {
    vi.mocked(modalityPickerSelections).mockReturnValue([{ id: 'chat-b', name: 'Text', entryId: 'chat-b', modelId: 'text' }]);
    vi.mocked(getMultimodalClientOverrides).mockReturnValue({ customApiKey: 'private-original', customBaseUrl: 'https://original.test' });
  });

  it('S13 optimization started before clear cannot resurrect old usage', async () => {
    const before = createUsageScope('chat', 'chat-b');
    vi.mocked(apiFetch).mockImplementationOnce(async () => {
      clearUsageLogs();
      return usageResult();
    });
    await optimizeVideoPrompt(usageInput, new AbortController().signal, usageContext);
    expect(getUsageLogs()).toHaveLength(0);
    expect(createUsageScope('chat', 'chat-b').epoch).not.toBe(before.epoch);
  });

  it('S13 in-flight optimization keeps its original channel', async () => {
    vi.mocked(getMultimodalClientOverrides).mockReturnValue({ customApiKey: 'original-key', customBaseUrl: 'https://original.test' });
    const before = createUsageScope('chat', 'chat-b');
    vi.mocked(apiFetch).mockImplementationOnce(async () => {
      vi.mocked(getMultimodalClientOverrides).mockReturnValue({ customApiKey: 'replacement-key', customBaseUrl: 'https://replacement.test' });
      return usageResult();
    });
    await optimizeVideoPrompt(usageInput, new AbortController().signal, usageContext);
    expect(getUsageLogs()).toHaveLength(1);
    expect(getUsageLogs()[0].scope?.channelId).toBe(before.channelId);
    expect(getUsageLogs()[0].scope?.channelId).not.toBe(createUsageScope('chat', 'chat-b').channelId);
  });

  it('S13 lost optimization receipt restores usage once through GET', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('lost reply')).mockResolvedValueOnce(usageResult());
    await expect(optimizeVideoPrompt(usageInput, new AbortController().signal, usageContext)).rejects.toThrow();
    await optimizeVideoPrompt(usageInput, new AbortController().signal, usageContext);
    await optimizeVideoPrompt(usageInput, new AbortController().signal, usageContext);
    expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
    expect(getUsageLogs()).toHaveLength(1);
    expect(JSON.stringify(getUsageLogs()[0])).toContain('7');
  });
});
