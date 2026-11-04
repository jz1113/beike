import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesPrompt } from '@shared/contracts/salesPrompts';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import { adaptSalesScriptPlan, type SalesPlanAdaptInput } from './salesProduction';
import { listSalesPrompts } from './salesPrompts';
import { adaptSalesSpokenCopy, SalesSpokenCopyRequestError } from './salesSpokenCopy';
import { rewriteSalesScriptPlan, type SalesPlanRewriteCheckpoint } from './salesPlanRewrite';

vi.mock('./salesProduction', () => ({ adaptSalesScriptPlan: vi.fn() }));
vi.mock('./salesPrompts', async (original) => ({ ...await original<typeof import('./salesPrompts')>(), listSalesPrompts: vi.fn() }));
vi.mock('./salesSpokenCopy', async (original) => ({ ...await original<typeof import('./salesSpokenCopy')>(), adaptSalesSpokenCopy: vi.fn() }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getMultimodalClientOverrides: vi.fn() }));
vi.mock('@shared/domain/models/textModelRoute', () => ({ selectedTextModel: vi.fn() }));

const input: SalesPlanAdaptInput = {
  productName: '咖啡条纹上衣', category: 'fashion', summary: '条纹与装饰扣', facts: '纽扣仅作装饰',
  buyingPoints: ['搭配纯色下装'], cautions: ['低温手洗'], scriptTitle: '穿搭', oneTake: true,
  voiceMode: 'speech', presentationMode: 'subtitled_intro', personaSummary: '当前人物', sceneSummary: '当前空间',
  sourceExclusions: [{ term: '旧品牌', type: 'brand_signage' }],
  beats: [0, 1].map((index) => ({ index, shotIndex: 0, start: index * 3, end: (index + 1) * 3,
    purpose: 'showcase', shotSize: '中景', camera: '固定', refAction: `原动作${index}`,
    sourceVoiceText: `原片台词${index}`, sourceLinePattern: `表达结构${index}`, sourceSubtitle: `原片字幕${index}`,
    requiredView: 'front', assignedView: 'front', imageLabel: '商品图', buyingPoint: '条纹' })),
};
const adapted = {
  beats: [0, 1].map((index) => ({ index, subject: '当前人物', action: `新动作${index}`,
    expression: '看镜头浅笑', transition: '延续末姿势', spokenLine: `待压缩台词${index}`, subtitle: `旧字幕${index}` })),
  model: 'text-model', promptVersion: 'plan-adapt:saved',
};
const spoken = { success: true as const, beats: [
  { index: 1, spokenLine: '搭纯色下装', subtitle: '搭配纯色' },
  { index: 0, spokenLine: '看这件条纹', subtitle: '咖啡条纹' },
], model: 'text-model', promptVersion: 'spoken-copy:saved', reviewPromptVersion: 'spoken-review:saved' };
const speech = { sourceCopy: '  人工修订推荐文案\n保留这处换行。 ', duration: 6.3, targetCps: 3.8 };
const prompts: SalesPrompt[] = ['plan-adapt', 'spoken-copy', 'spoken-review'].map((id) => ({
  id, title: id, description: '', prompt: `用户保存的${id}`, defaultPrompt: '初始模板',
  version: 'saved-v1', customized: true, configured: true,
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMultimodalClientOverrides).mockReturnValue({ textProtocol: 'openai' });
  vi.mocked(selectedTextModel).mockReturnValue({ modelId: 'configured-upstream' });
  vi.mocked(listSalesPrompts).mockResolvedValue(prompts);
  vi.mocked(adaptSalesScriptPlan).mockResolvedValue(structuredClone(adapted));
  vi.mocked(adaptSalesSpokenCopy).mockResolvedValue(structuredClone(spoken));
});

describe('timed spoken copy within product storyboard rewrite', () => {
  it.each(['speech', 'voiceover'] as const)('checks saved prompts then runs plan and %s copy in order', async (voiceMode) => {
    const events: string[] = [];
    const abort = new AbortController();
    vi.mocked(listSalesPrompts).mockImplementation(async () => { events.push('preflight'); return prompts; });
    vi.mocked(adaptSalesScriptPlan).mockImplementation(async () => { events.push('plan'); return structuredClone(adapted); });
    vi.mocked(adaptSalesSpokenCopy).mockImplementation(async () => { events.push('spoken'); return structuredClone(spoken); });
    const onProgress = vi.fn(() => { events.push('progress'); });
    const result = await rewriteSalesScriptPlan({ ...input, voiceMode }, speech, 'channel:model', abort.signal, onProgress);
    expect(events).toEqual(['preflight', 'plan', 'progress', 'spoken']);
    expect(listSalesPrompts).toHaveBeenCalledWith(abort.signal);
    expect(adaptSalesScriptPlan).toHaveBeenCalledWith({ ...input, voiceMode, narration: speech }, 'channel:model', abort.signal);
    expect(adaptSalesSpokenCopy).toHaveBeenCalledWith({
      ...speech, productName: input.productName, summary: input.summary, facts: input.facts,
      buyingPoints: input.buyingPoints, cautions: input.cautions, sourceExclusions: input.sourceExclusions, voiceMode,
      beats: input.beats.map((beat, index) => ({ index: beat.index, start: beat.start, end: beat.end,
        action: adapted.beats[index].action, spokenLine: adapted.beats[index].spokenLine, subtitle: adapted.beats[index].subtitle,
        expression: adapted.beats[index].expression, transition: adapted.beats[index].transition,
        shotIndex: beat.shotIndex, shotSize: beat.shotSize, camera: beat.camera,
        requiredView: beat.requiredView, assignedView: beat.assignedView, subject: adapted.beats[index].subject,
        purpose: beat.purpose, buyingPoint: beat.buyingPoint,
        sourceVoiceText: beat.sourceVoiceText, sourceLinePattern: beat.sourceLinePattern, sourceSubtitle: beat.sourceSubtitle })),
    }, 'channel:model', abort.signal);
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining(voiceMode === 'voiceover' ? '旁白' : '口播'));
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('1—3 个商品重点'));
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('连贯'));
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('字幕提炼关键词'));
    expect(result).toEqual({ ...adapted, beats: adapted.beats.map((beat) => ({ ...beat,
      spokenLine: spoken.beats.find((line) => line.index === beat.index)!.spokenLine,
      subtitle: spoken.beats.find((line) => line.index === beat.index)!.subtitle,
    })), spokenCopyPromptVersion: spoken.promptVersion, spokenReviewPromptVersion: spoken.reviewPromptVersion });
    expect(adapted.beats[0].spokenLine).toBe('待压缩台词0');
  });

  it.each([
    { voiceMode: 'none' as const },
    { voiceMode: 'speech' as const, presentationMode: 'clean_visual' as const },
    { voiceMode: 'voiceover' as const, presentationMode: 'clean_visual' as const },
  ])('skips timed copy and its preflight for %j', async (mode) => {
    const onProgress = vi.fn();
    const result = await rewriteSalesScriptPlan({ ...input, ...mode }, speech, 'channel:model', new AbortController().signal, onProgress);
    expect(result).toEqual({ ...adapted, spokenCopyPromptVersion: '', spokenReviewPromptVersion: '' });
    expect(listSalesPrompts).not.toHaveBeenCalled();
    expect(adaptSalesSpokenCopy).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it.each(['plan-adapt', 'spoken-copy', 'spoken-review'])('stops before either model call when %s is missing or blank', async (id) => {
    for (const invalid of [prompts.filter((prompt) => prompt.id !== id),
      prompts.map((prompt) => prompt.id === id ? { ...prompt, prompt: '  ' } : prompt),
      prompts.map((prompt) => prompt.id === id ? { ...prompt, configured: false } : prompt)]) {
      vi.mocked(listSalesPrompts).mockResolvedValue(invalid);
      await expect(rewriteSalesScriptPlan(input, speech, 'channel:model', new AbortController().signal, vi.fn())).rejects.toThrow('原分镜已保留');
    }
    expect(adaptSalesScriptPlan).not.toHaveBeenCalled();
    expect(adaptSalesSpokenCopy).not.toHaveBeenCalled();
  });

  it('identifies an outdated backend separately from an unsaved review template', async () => {
    vi.mocked(listSalesPrompts).mockResolvedValue(prompts.filter((prompt) => prompt.id !== 'spoken-review'));
    await expect(rewriteSalesScriptPlan(input, speech, 'channel:model', new AbortController().signal, vi.fn()))
      .rejects.toMatchObject({ status: 503, promptId: '', message: expect.stringContaining('请重启贝壳服务') });
    vi.mocked(listSalesPrompts).mockResolvedValue(prompts.map((prompt) => prompt.id === 'spoken-review'
      ? { ...prompt, configured: false, prompt: '' } : prompt));
    await expect(rewriteSalesScriptPlan(input, speech, 'channel:model', new AbortController().signal, vi.fn()))
      .rejects.toMatchObject({ status: 400, promptId: 'spoken-review', message: expect.stringContaining('保存「口播语义验收」') });
    expect(adaptSalesScriptPlan).not.toHaveBeenCalled();
    expect(adaptSalesSpokenCopy).not.toHaveBeenCalled();
  });

  it('keeps an intentionally empty recommendation instead of substituting old copy', async () => {
    await rewriteSalesScriptPlan(input, { ...speech, sourceCopy: '' }, 'channel:model', new AbortController().signal, vi.fn());
    expect(vi.mocked(adaptSalesSpokenCopy).mock.calls[0][0].sourceCopy).toBe('');
  });

  it('uses the adapted subject and preserves shot grouping without carrying the old presenter into copy', async () => {
    const beats = input.beats.map((beat) => ({ ...beat, subject: '原片旧模特' }));
    vi.mocked(adaptSalesScriptPlan).mockResolvedValue({ ...adapted,
      beats: adapted.beats.map((beat, index) => ({ ...beat, subject: index === 0 ? '当前人物与商品' : '' })),
    });
    await rewriteSalesScriptPlan({ ...input, beats }, speech, 'channel:model', new AbortController().signal, vi.fn());
    const context = vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0].beats;
    expect(context.map((beat) => beat.subject)).toEqual(['当前人物与商品', '']);
    expect(context.map((beat) => beat.shotIndex)).toEqual([0, 0]);
    expect(JSON.stringify(context)).not.toContain('原片旧模特');
  });

  it.each(['手掌自然贴在当前商品正面', ''])('preserves an explicit subject %j before spoken copy and in the complete result', async (subject) => {
    const modelResult = structuredClone(adapted);
    vi.mocked(adaptSalesScriptPlan).mockResolvedValue(modelResult);
    const original = structuredClone(input);
    const result = await rewriteSalesScriptPlan(input, speech, 'channel:model', new AbortController().signal, vi.fn(), new Map([[0, subject]]));
    expect(result.beats[0].subject).toBe(subject);
    expect(result.beats[1].subject).toBe(modelResult.beats[1].subject);
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0].beats[0].subject).toBe(subject);
    expect(modelResult).toEqual(adapted);
    expect(input).toEqual(original);
    expect(adaptSalesScriptPlan).toHaveBeenCalledWith({...input,narration:speech}, 'channel:model', expect.any(AbortSignal));
  });

  it.each([
    [{ ...input.beats[0], end: 3.2 }, input.beats[1]],
    [input.beats[0], { ...input.beats[1], end: 7 }],
  ])('rejects overlapping or out-of-duration speech beats before model calls', async (...beats) => {
    await expect(rewriteSalesScriptPlan({ ...input, beats }, speech, 'channel:model', new AbortController().signal, vi.fn())).rejects.toThrow('核对分镜时间');
    expect(adaptSalesScriptPlan).not.toHaveBeenCalled();
    expect(adaptSalesSpokenCopy).not.toHaveBeenCalled();
  });

  it.each(['preflight', 'plan', 'spoken'] as const)('does not return a partial storyboard after %s fails', async (stage) => {
    const original = structuredClone(input);
    const failure = new Error(`${stage}失败`);
    if (stage === 'preflight') vi.mocked(listSalesPrompts).mockRejectedValue(failure);
    if (stage === 'plan') vi.mocked(adaptSalesScriptPlan).mockRejectedValue(failure);
    if (stage === 'spoken') vi.mocked(adaptSalesSpokenCopy).mockRejectedValue(failure);
    await expect(rewriteSalesScriptPlan(input, speech, 'channel:model', new AbortController().signal, vi.fn())).rejects.toBe(failure);
    expect(input).toEqual(original);
    if (stage !== 'spoken') expect(adaptSalesSpokenCopy).not.toHaveBeenCalled();
  });

  it.each(['before', 'preflight', 'plan', 'progress', 'spoken'] as const)('does not adopt a result cancelled at %s', async (stage) => {
    const abort = new AbortController();
    if (stage === 'before') abort.abort();
    vi.mocked(listSalesPrompts).mockImplementation(async () => { if (stage === 'preflight') abort.abort(); return prompts; });
    vi.mocked(adaptSalesScriptPlan).mockImplementation(async () => { if (stage === 'plan') abort.abort(); return structuredClone(adapted); });
    vi.mocked(adaptSalesSpokenCopy).mockImplementation(async () => {
      abort.signal.throwIfAborted();
      if (stage === 'spoken') abort.abort();
      return structuredClone(spoken);
    });
    await expect(rewriteSalesScriptPlan(input, speech, 'channel:model', abort.signal, () => {
      if (stage === 'progress') abort.abort();
    })).rejects.toMatchObject({ name: 'AbortError' });
    if (stage === 'before' || stage === 'preflight') expect(adaptSalesScriptPlan).not.toHaveBeenCalled();
    if (stage === 'before' || stage === 'preflight' || stage === 'plan') expect(adaptSalesSpokenCopy).not.toHaveBeenCalled();
  });
});

describe('unpublished storyboard rewrite recovery', () => {
  const pendingReview = () => ({ beats: structuredClone(spoken.beats), promptVersion: 'spoken-copy:original' });
  const timeout = () => new SalesSpokenCopyRequestError('口播语义验收超时', 'summary_timeout', pendingReview());
  const checkpoint = () => ({ current: null as SalesPlanRewriteCheckpoint | null });
  const run = (cache: ReturnType<typeof checkpoint>, signal = new AbortController().signal) =>
    rewriteSalesScriptPlan(input, speech, 'channel:model', signal, vi.fn(), undefined, cache);

  it('retries review of the exact pending draft without regenerating a plan or writing new copy', async () => {
    const cache = checkpoint();
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(timeout());
    await expect(run(cache)).rejects.toThrow('验收超时');
    expect(cache.current?.pendingReview).toEqual(pendingReview());
    vi.mocked(adaptSalesSpokenCopy).mockResolvedValueOnce({ ...spoken, promptVersion: '' });
    const result = await run(cache);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(adaptSalesSpokenCopy).toHaveBeenCalledTimes(2);
    const retry = vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0];
    expect(retry.reviewOnly).toBe(true);
    expect(retry.beats.map(({ index, spokenLine, subtitle }) => ({ index, spokenLine, subtitle })))
      .toEqual(input.beats.map(({ index }) => pendingReview().beats.find((beat) => beat.index === index)));
    expect(result.spokenCopyPromptVersion).toBe('spoken-copy:original');
    expect(result.spokenReviewPromptVersion).toBe(spoken.reviewPromptVersion);
    expect(cache.current).toBeNull();
    await run(cache);
    expect(adaptSalesScriptPlan).toHaveBeenCalledTimes(2);
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0].reviewOnly).toBeUndefined();
  });

  it('keeps a completed visual plan after a copy failure and resumes only the writing step', async () => {
    const cache = checkpoint();
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(new Error('口播改写暂不可用'));
    await expect(run(cache)).rejects.toThrow('暂不可用');
    expect(cache.current?.adapted).toEqual(adapted);
    await run(cache);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0].reviewOnly).toBeUndefined();
  });

  it('rejects a changed review receipt and discards that candidate before the next writing attempt', async () => {
    const cache = checkpoint();
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(timeout());
    await expect(run(cache)).rejects.toThrow('验收超时');
    vi.mocked(adaptSalesSpokenCopy).mockResolvedValueOnce({ ...spoken,
      beats: spoken.beats.map((beat) => ({ ...beat, spokenLine: '审核端篡改的台词' })) });
    await expect(run(cache)).rejects.toThrow('与待验收稿不一致');
    expect(cache.current?.pendingReview).toBeUndefined();
    await run(cache);
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0].reviewOnly).toBeUndefined();
  });

  it.each(['spoken_copy_review_rejected', 'spoken_copy_validation', 'spoken_copy_review_invalid'])('discards a pending draft after %s', async (code) => {
    const cache = checkpoint();
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(timeout());
    await expect(run(cache)).rejects.toThrow('验收超时');
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(new SalesSpokenCopyRequestError('本稿未通过', code));
    await expect(run(cache)).rejects.toThrow('本稿未通过');
    expect(cache.current?.pendingReview).toBeUndefined();
    await run(cache);
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0].reviewOnly).toBeUndefined();
  });

  it.each(['model', 'product', 'facts', 'duration', 'speed', 'promptVersion', 'promptContent', 'manualSubject'])('does not reuse a pending draft after %s changes', async (change) => {
    const cache = checkpoint();
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(timeout());
    await expect(run(cache)).rejects.toThrow('验收超时');
    const changedInput = { ...input, ...(change === 'product' ? { productName: '另一件外套' } : {}),
      ...(change === 'facts' ? { facts: '面料更新' } : {}) };
    const changedSpeech = { ...speech, ...(change === 'duration' ? { duration: 7 } : {}), ...(change === 'speed' ? { targetCps: 4.2 } : {}) };
    if (change.startsWith('prompt')) vi.mocked(listSalesPrompts).mockResolvedValue(prompts.map((prompt) => prompt.id !== 'spoken-review'
      ? prompt : { ...prompt, ...(change === 'promptVersion' ? { version: 'review-v2' } : { prompt: '更新后的验收标准' }) }));
    await rewriteSalesScriptPlan(changedInput, changedSpeech, change === 'model' ? 'another:model' : 'channel:model',
      new AbortController().signal, vi.fn(), change === 'manualSubject' ? new Map([[0, '人工主体']]) : undefined, cache);
    expect(adaptSalesScriptPlan).toHaveBeenCalledTimes(2);
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0].reviewOnly).toBeUndefined();
  });

  it.each(['modelId', 'textProtocol', 'customBaseUrl', 'apiFormat', 'allowInsecureHttp'])('invalidates the draft when the same selected route changes its %s', async (field) => {
    const cache = checkpoint();
    const route = { textProtocol: 'openai' as const, customBaseUrl: 'https://first.example.test/v1', customApiKey: 'first-private-key' };
    vi.mocked(getMultimodalClientOverrides).mockReturnValue(route);
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(timeout());
    await expect(run(cache)).rejects.toThrow('验收超时');
    if (field === 'modelId') vi.mocked(selectedTextModel).mockReturnValue({ modelId: 'another-upstream' });
    else vi.mocked(getMultimodalClientOverrides).mockReturnValue({ ...route,
      ...(field === 'textProtocol' ? { textProtocol: 'anthropic' as const } : {}),
      ...(field === 'customBaseUrl' ? { customBaseUrl: 'https://second.example.test/v1' } : {}),
      ...(field === 'apiFormat' ? { apiFormat: 'openai-responses' as const } : {}),
      ...(field === 'allowInsecureHttp' ? { allowInsecureHttp: true } : {}),
    });
    await run(cache);
    expect(adaptSalesScriptPlan).toHaveBeenCalledTimes(2);
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0].reviewOnly).toBeUndefined();
  });

  it('excludes route credentials from the checkpoint and can resume after credential rotation', async () => {
    const cache = checkpoint();
    const route = { textProtocol: 'openai' as const, customBaseUrl: 'https://text.example.test/v1', customApiKey: 'first-private-key' };
    vi.mocked(getMultimodalClientOverrides).mockReturnValue(route);
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(timeout());
    await expect(run(cache)).rejects.toThrow('验收超时');
    expect(cache.current?.key).toContain(route.customBaseUrl);
    expect(cache.current?.key).toContain('configured-upstream');
    expect(cache.current?.key).not.toContain(route.customApiKey);
    vi.mocked(getMultimodalClientOverrides).mockReturnValue({ ...route, customApiKey: 'rotated-private-key' });
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(new SalesSpokenCopyRequestError('仍在等待验收', 'summary_timeout'));
    await expect(run(cache)).rejects.toThrow('仍在等待验收');
    expect(adaptSalesScriptPlan).toHaveBeenCalledOnce();
    expect(vi.mocked(adaptSalesSpokenCopy).mock.lastCall![0].reviewOnly).toBe(true);
    expect(cache.current?.key).not.toContain('rotated-private-key');
    expect(cache.current?.pendingReview).toEqual(pendingReview());
  });

  it.each(['before', 'review'] as const)('clears an unpublished checkpoint when cancelled %s retry', async (stage) => {
    const cache = checkpoint();
    vi.mocked(adaptSalesSpokenCopy).mockRejectedValueOnce(timeout());
    await expect(run(cache)).rejects.toThrow('验收超时');
    const abort = new AbortController();
    if (stage === 'before') abort.abort();
    else vi.mocked(adaptSalesSpokenCopy).mockImplementationOnce(async () => { abort.abort(); return structuredClone(spoken); });
    await expect(run(cache, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(cache.current).toBeNull();
    await run(cache);
    expect(adaptSalesScriptPlan).toHaveBeenCalledTimes(2);
  });
});

it('uses the joint draft and executes only its review when it passes', async () => {
  vi.mocked(adaptSalesScriptPlan).mockResolvedValue({ ...adapted, spokenCopyPromptVersion: 'joint-copy-v1' });
  const beats = adapted.beats.map(({index, spokenLine, subtitle}) => ({index, spokenLine, subtitle}));
  vi.mocked(adaptSalesSpokenCopy).mockResolvedValue({ ...spoken, beats, promptVersion: '' });
  const result = await rewriteSalesScriptPlan(input, speech, 'channel:model', new AbortController().signal, vi.fn());
  expect(vi.mocked(adaptSalesScriptPlan).mock.calls[0][0].narration).toEqual(speech);
  expect(adaptSalesScriptPlan).toHaveBeenCalledTimes(1);
  expect(adaptSalesSpokenCopy).toHaveBeenCalledTimes(1);
  expect(vi.mocked(adaptSalesSpokenCopy).mock.calls[0][0].reviewOnly).toBe(true);
  expect(result.spokenCopyPromptVersion).toBe('joint-copy-v1');
});

it('rejects a joint draft review that changes the submitted subtitles', async () => {
  vi.mocked(adaptSalesScriptPlan).mockResolvedValue({ ...adapted, spokenCopyPromptVersion: 'joint-copy-v1' });
  const beats = adapted.beats.map(({ index, spokenLine }) => ({ index, spokenLine, subtitle: '意外替换的字幕' }));
  vi.mocked(adaptSalesSpokenCopy).mockResolvedValue({ ...spoken, beats, promptVersion: '' });
  await expect(rewriteSalesScriptPlan(input, speech, 'channel:model', new AbortController().signal, vi.fn()))
    .rejects.toThrow('与分镜初稿不一致');
  expect(adaptSalesSpokenCopy).toHaveBeenCalledTimes(1);
});
