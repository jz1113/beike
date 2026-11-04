import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate, bindBeatProductImages } from '@shared/domain/sales';
import type { SalesPrompt } from '@shared/contracts/salesPrompts';
import { emptySalesCollection } from '../model/salesCollectionDraft';
import { salesSpokenReviewInput, salesSpokenReviewSourceKey } from '../model/salesSpokenReview';
import { parseSalesProductionPlan } from '../model/salesProductionDraft';
import { reviewSalesProductionSpeech } from './salesProductionReview';
import { adaptSalesSpokenCopy } from './salesSpokenCopy';
import { listSalesPrompts } from './salesPrompts';

vi.mock('./salesPrompts', () => ({ listSalesPrompts: vi.fn() }));
vi.mock('./salesSpokenCopy', () => ({ adaptSalesSpokenCopy: vi.fn() }));
const prompt: SalesPrompt = { id: 'spoken-review', title: '口播语义验收', description: '',
  prompt: '工作区审稿规则', defaultPrompt: '初始模板', version: 'review:v1', configured: true, customized: true };
const script = normalizeScriptTemplate({ durationSec: 5, voiceMode: 'speech',
  shots: [{ beats: [{ start: 0, end: 5, action: '展示领口', subject: '当前人物' }] }] })!;
const state = () => {
  const value = emptySalesCollection();
  value.productName = '棉上衣'; value.props = { 成分: '棉' };
  value.productionPlan.adaptedBeats = [{ index: 0, subject: '当前人物', action: '展示领口', spokenLine: '这件用的是棉面料。', subtitle: '棉面料' }];
  value.productionPlan.generatedVideoUrl = '/existing.mp4';
  return value;
};
const bindings = bindBeatProductImages(script, []);
const controller = () => new AbortController();
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(listSalesPrompts).mockResolvedValue([prompt]);
  vi.mocked(adaptSalesSpokenCopy).mockImplementation(async (input) => ({ success: true,
    model: 'text', promptVersion: 'copy:v1', reviewPromptVersion: prompt.version,
    beats: input.beats.map((beat) => ({ index: beat.index, spokenLine: beat.spokenLine || '', subtitle: beat.subtitle || '' })),
  }));
});
afterEach(() => vi.resetAllMocks());

describe('current draft semantic review before paid generation', () => {
  it('reviews an explicitly cleared subject without restoring the old script subject', () => {
    const value = state();
    value.productionPlan.adaptedBeats[0] = { ...value.productionPlan.adaptedBeats[0], subject: '', action: '', manualPerformanceFields: ['subject'] };
    const input = salesSpokenReviewInput(value, script, bindings, 'speech', 5);
    expect(input?.beats[0]).toMatchObject({ subject: '', action: '展示领口' });
  });

  it('bypasses speech review for pure visuals', async () => {
    expect(await reviewSalesProductionSpeech(state(), script, bindings, 'none', 5, '', controller().signal, vi.fn()))
      .toEqual({ spokenReviewPromptVersion: '', spokenReviewSourceKey: '' });
    expect(listSalesPrompts).not.toHaveBeenCalled(); expect(adaptSalesSpokenCopy).not.toHaveBeenCalled();
  });
  it('checks a manual draft without rewriting or changing existing video', async () => {
    const value = state(); const original = structuredClone(value);
    const receipt = await reviewSalesProductionSpeech(value, script, bindings, 'speech', 5, 'text', controller().signal, vi.fn());
    expect(adaptSalesSpokenCopy).toHaveBeenCalledWith(expect.objectContaining({ reviewOnly: true, facts: '成分：棉',
      beats: [expect.objectContaining({ spokenLine: '这件用的是棉面料。', subtitle: '棉面料' })] }), 'text', expect.any(AbortSignal));
    expect(receipt.spokenReviewPromptVersion).toBe(prompt.version);
    expect(receipt.spokenReviewSourceKey).not.toBe(''); expect(value).toEqual(original);
    expect(parseSalesProductionPlan({ ...value.productionPlan, ...receipt })).toMatchObject(receipt);
  });
  it('reuses only the matching current words, evidence and saved review version', async () => {
    const value = state();
    value.productionPlan.spokenReviewPromptVersion = prompt.version;
    value.productionPlan.spokenReviewSourceKey = salesSpokenReviewSourceKey(salesSpokenReviewInput(value, script, bindings, 'speech', 5));
    await reviewSalesProductionSpeech(value, script, bindings, 'speech', 5, '', controller().signal, vi.fn());
    expect(adaptSalesSpokenCopy).not.toHaveBeenCalled();
    value.productionPlan.adaptedBeats[0].spokenLine = '领口这里也看一下。';
    await reviewSalesProductionSpeech(value, script, bindings, 'speech', 5, 'text', controller().signal, vi.fn());
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
  });
  it.each(['facts', 'subtitle', 'action', 'expression', 'transition', 'duration', 'mode', 'rules'] as const)('requires a new approval after %s changes', async (field) => {
    const value = state();
    value.productionPlan.spokenReviewPromptVersion = prompt.version;
    value.productionPlan.spokenReviewSourceKey = salesSpokenReviewSourceKey(salesSpokenReviewInput(value, script, bindings, 'speech', 5));
    if (field === 'facts') value.props = { 成分: '亚麻' };
    if (field === 'subtitle') value.productionPlan.adaptedBeats[0].subtitle = '修订字幕';
    if (field === 'action') value.productionPlan.adaptedBeats[0].action = '展示袖口';
    if (field === 'expression') value.productionPlan.adaptedBeats[0].expression = '转头背对镜头';
    if (field === 'transition') value.productionPlan.adaptedBeats[0].transition = '抬手遮住口部';
    if (field === 'rules') {
      vi.mocked(listSalesPrompts).mockResolvedValue([{ ...prompt, version: 'review:v2' }]);
      vi.mocked(adaptSalesSpokenCopy).mockImplementation(async (input) => ({ success: true, model: 'text', promptVersion: 'copy:v1',
        reviewPromptVersion: 'review:v2', beats: input.beats.map((beat) => ({ index: beat.index, spokenLine: beat.spokenLine || '', subtitle: beat.subtitle || '' })) }));
    }
    await reviewSalesProductionSpeech(value, script, bindings, field === 'mode' ? 'voiceover' : 'speech', field === 'duration' ? 6 : 5, 'text', controller().signal, vi.fn());
    expect(adaptSalesSpokenCopy).toHaveBeenCalledOnce();
  });
  it('stops without a saved reviewer or model and leaves the draft intact', async () => {
    const value = state(); const original = structuredClone(value);
    vi.mocked(listSalesPrompts).mockResolvedValue([{ ...prompt, configured: false, prompt: '' }]);
    await expect(reviewSalesProductionSpeech(value, script, bindings, 'speech', 5, 'text', controller().signal, vi.fn())).rejects.toThrow('保存「口播语义验收」');
    vi.mocked(listSalesPrompts).mockResolvedValue([prompt]);
    await expect(reviewSalesProductionSpeech(value, script, bindings, 'speech', 5, '', controller().signal, vi.fn())).rejects.toThrow('选择改写模型');
    expect(adaptSalesSpokenCopy).not.toHaveBeenCalled(); expect(value).toEqual(original);
  });
  it('never accepts an altered review-only response or a response after cancellation', async () => {
    const value = state();
    vi.mocked(adaptSalesSpokenCopy).mockResolvedValue({ success: true, model: 'text', promptVersion: 'copy:v1', reviewPromptVersion: prompt.version,
      beats: [{ index: 0, spokenLine: '偷偷改写', subtitle: '棉面料' }] });
    await expect(reviewSalesProductionSpeech(value, script, bindings, 'speech', 5, 'text', controller().signal, vi.fn())).rejects.toThrow('与原稿不一致');
    const abort = controller();
    vi.mocked(listSalesPrompts).mockImplementation(async () => { abort.abort(); return [prompt]; });
    await expect(reviewSalesProductionSpeech(value, script, bindings, 'speech', 5, 'text', abort.signal, vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
    expect(value.productionPlan.spokenReviewPromptVersion).toBe('');
    expect(value.productionPlan.generatedVideoUrl).toBe('/existing.mp4');
  });
});
