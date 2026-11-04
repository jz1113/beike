import { describe, expect, it } from 'vitest';
import { assembleSalesVideoPrompt, normalizeScriptTemplate } from '@shared/domain/sales';
import { emptySalesProductionPlan } from './salesProductionDraft';
import { resolveSalesProductionTimeline } from './salesProductionTimeline';
import { resolveSalesVideoSettings } from './salesVideoSettings';

const boundaries = [0, 2.1, 4.6, 6.8, 10.1, 12.6, 16.6, 18.2];
const source = normalizeScriptTemplate({
  title: '原始服装展示', durationSec: 18.8, visualSpec: { oneTake: true },
  shots: [{ start: 0, end: 18.2, summary: '完整动作', beats: boundaries.slice(0, -1).map((start, index) => ({
    start, end: boundaries[index + 1], action: `动作${index + 1}`, expression: '自然表情', transition: '承接上段',
    voice: { mode: 'speech', text: `原台词${index + 1}` },
  })) }],
})!;
const plan = { ...emptySalesProductionPlan(), videoModel: 'doubao-seedance-2.0-mini' };
const depthPlan = { ...plan, imitationMode: 'depth_imitation' as const, scriptVideoReference: 'depth' as const };

describe('sales production timing follows the model selected before adaptation', () => {
  it('retains complete storyboard actions at their original speed and clearly identifies excluded actions', () => {
    const snapshot = JSON.stringify(source);
    const result = resolveSalesProductionTimeline(plan, source);
    expect(result).toMatchObject({ sourceDurationSec: 18.8, targetDurationSec: 13, modelMaxDurationSec: 15, changed: true, truncatedEnding: true, error: '' });
    expect(resolveSalesVideoSettings(plan, result.script, []).durationSec).toBe(result.targetDurationSec);
    expect(result.script.durationSec).toBe(12.6);
    expect(result.script.shots[0]).toMatchObject({ start: 0, end: 12.6 });
    expect(result.script.shots[0].beats.map((beat) => [beat.start, beat.end]))
      .toEqual([[0, 2.1], [2.1, 4.6], [4.6, 6.8], [6.8, 10.1], [10.1, 12.6]]);
    expect(result.script.shots[0].beats).toEqual(source.shots[0].beats.slice(0, 5));
    expect(result.script.shots[0].beats[0]).toMatchObject({ expression: '自然表情', transition: '承接上段', voice: { text: '原台词1' } });
    for (const text of ['前 5/7 个完整动作段', '后续 2 段本次不生成', '口播与字幕仅按保留段适配', '余时自然收势']) expect(result.notice).toContain(text);
    expect(result.depthClipEndSec).toBeUndefined();
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it('uses a shorter explicit duration even on a model that can fit the full reference', () => {
    const result = resolveSalesProductionTimeline({ ...plan, videoModel: 'doubao-seedance-2.5', videoDurationSec: 10 }, source);
    expect(result).toMatchObject({ targetDurationSec: 10, modelMaxDurationSec: 30, changed: true, error: '' });
    expect(result.script.durationSec).toBe(6.8);
    expect(result.script.shots[0].beats).toEqual(source.shots[0].beats.slice(0, 3));
    expect(resolveSalesVideoSettings({ ...plan, videoModel: 'doubao-seedance-2.5', videoDurationSec: 10 }, result.script, []).durationSec).toBe(10);
    expect(result.notice).toContain('成片 10 秒，余时自然收势');
  });

  it('preserves an explicit 15-second output and excludes later narration and subtitles without deleting manual edits', () => {
    const explicit = { ...plan, videoDurationSec: 15 };
    const result = resolveSalesProductionTimeline(explicit, source);
    const edits = source.shots[0].beats.map((_, index) => ({ index, subject: '', action: `手动动作${index + 1}`,
      spokenLine: `手动台词${index + 1}`, subtitle: `字幕${index + 1}` }));
    const snapshot = JSON.stringify(edits);
    const assembled = assembleSalesVideoPrompt({
      finalVideoTemplate: '{{referenceFacts}}\n{{photographyFacts}}\n{{timelineFacts}}\n{{audioFacts}}',
      script: result.script, productName: '外套', selectedImages: [], beatBindings: [], adaptedBeats: edits,
      persona: null, scene: null, voiceModeOverride: 'voiceover',
    });
    expect(result.targetDurationSec).toBe(15);
    expect(result.script.durationSec).toBe(12.6);
    expect(assembled.narrationText).toBe('手动台词1 手动台词2 手动台词3 手动台词4 手动台词5');
    expect(assembled.subtitles.map((subtitle) => [subtitle.index, subtitle.start, subtitle.end, subtitle.text]))
      .toEqual(source.shots[0].beats.slice(0, 5).map((beat, index) => [index, beat.start, beat.end, `字幕${index + 1}`]));
    expect(assembled.enginePrompt).not.toContain('手动动作6');
    expect(JSON.stringify(edits)).toBe(snapshot);
  });

  it('keeps the complete original timeline when it fits, including a source tail after the last action', () => {
    const result = resolveSalesProductionTimeline({ ...plan, videoModel: 'doubao-seedance-2.5' }, source);
    expect(result).toMatchObject({ targetDurationSec: 19, modelMaxDurationSec: 30, changed: false, truncatedEnding: false, notice: '', error: '' });
    expect(result.script).toBe(source);
    expect(resolveSalesProductionTimeline({ ...plan, videoModel: 'doubao-seedance-2.5', videoDurationSec: 25 }, source).script).toBe(source);
  });

  it('keeps only a continuous prefix of whole depth actions without retiming', () => {
    const snapshot = JSON.stringify(source);
    const result = resolveSalesProductionTimeline(depthPlan, source);
    expect(result).toMatchObject({ targetDurationSec: 13, changed: true, truncatedEnding: true, depthClipEndSec: 12.6, error: '' });
    expect(resolveSalesVideoSettings(depthPlan, result.script, []).durationSec).toBe(result.targetDurationSec);
    expect(result.script.durationSec).toBe(12.6);
    expect(result.script.shots[0]).toMatchObject({ start: 0, end: 12.6 });
    expect(result.script.shots[0].beats).toEqual(source.shots[0].beats.slice(0, 5));
    expect(result.notice).toContain('原速度播放');
    expect(result.notice).toContain('余时自然收势');
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it.each([plan, depthPlan])('marks an omitted next action without overwriting its original transition or the restored final expression', (productionPlan) => {
    const original = { ...source, shots: [{ ...source.shots[0], beats: source.shots[0].beats.map((beat, index) => ({
      ...beat,
      ...(index === 4 ? { transition: '左手落下，转向袖口展示', action: '双手打开衣襟，随后在身侧展开' } : {}),
      ...(index === 6 ? { transition: '保持背身姿态结束', expression: '自然微笑后放松' } : {}),
    })) }] };
    const snapshot = JSON.stringify(original);
    const shortened = resolveSalesProductionTimeline(productionPlan, original);
    expect(shortened.truncatedEnding).toBe(true);
    expect(shortened.script.shots[0].beats.at(-1)).toMatchObject({
      transition: '左手落下，转向袖口展示', action: '双手打开衣襟，随后在身侧展开',
    });
    const restored = resolveSalesProductionTimeline({ ...productionPlan, videoModel: 'doubao-seedance-2.5' }, original);
    expect(restored.truncatedEnding).toBe(false);
    expect(restored.script).toBe(original);
    expect(restored.script.shots[0].beats.at(-1)).toMatchObject({ transition: '保持背身姿态结束', expression: '自然微笑后放松' });
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it.each([plan, depthPlan])('does not mark a truncated action ending when only source tail padding is removed', (productionPlan) => {
    const completeActions = { ...source, shots: [{ ...source.shots[0], end: 12.6, beats: source.shots[0].beats.slice(0, 5) }] };
    const result = resolveSalesProductionTimeline(productionPlan, completeActions);
    expect(result).toMatchObject({ changed: true, truncatedEnding: false, targetDurationSec: 13 });
    expect(result.script.shots[0].beats).toEqual(completeActions.shots[0].beats);
  });

  it.each([plan, depthPlan])('filters later shots while preserving flattened beat indexes for the retained prefix', (productionPlan) => {
    const multiple = { ...source, shots: [
      { ...source.shots[0], end: 6.8, beats: source.shots[0].beats.slice(0, 3) },
      { ...source.shots[0], start: 6.8, end: 16.6, beats: source.shots[0].beats.slice(3, 6) },
      { ...source.shots[0], start: 16.6, beats: source.shots[0].beats.slice(6) },
    ] };
    const result = resolveSalesProductionTimeline(productionPlan, multiple);
    expect(result.script.shots).toHaveLength(2);
    expect(result.script.shots.map((shot) => [shot.start, shot.end])).toEqual([[0, 6.8], [6.8, 12.6]]);
    expect(result.script.shots.flatMap((shot) => shot.beats).map((beat) => beat.action))
      .toEqual(['动作1', '动作2', '动作3', '动作4', '动作5']);
  });

  it.each([plan, depthPlan])('blocks a segment that cannot fit whole rather than truncating or speeding it up', (productionPlan) => {
    const longAction = normalizeScriptTemplate({ durationSec: 18.8, shots: [{ beats: [{ start: 0, end: 18.8, action: '一个完整动作' }] }] })!;
    const result = resolveSalesProductionTimeline(productionPlan, longAction);
    expect(result.changed).toBe(false);
    expect(result.script).toBe(longAction);
    expect(result.error).toContain('第一个完整动作段');
    expect(result.error).toContain('不会加速或从中截断');
  });

  it('also honors reference-video limits when the selected output model supports longer videos', () => {
    const result = resolveSalesProductionTimeline({ ...depthPlan, videoModel: 'wan3.0-video' }, source);
    expect(result).toMatchObject({ modelMaxDurationSec: 30, targetDurationSec: 13, depthClipEndSec: 12.6, error: '' });
    expect(resolveSalesVideoSettings({ ...depthPlan, videoModel: 'wan3.0-video' }, result.script, []).durationSec).toBe(result.targetDurationSec);
    const explicit = resolveSalesProductionTimeline({ ...depthPlan, videoModel: 'wan3.0-video', videoDurationSec: 20 }, source);
    expect(explicit).toMatchObject({ targetDurationSec: 20, depthClipEndSec: 6.8, error: '' });
    expect(explicit.script.shots[0].beats).toHaveLength(3);
    expect(resolveSalesProductionTimeline({ ...depthPlan, videoModel: 'wan3.0-video', videoDurationSec: 30 }, source).error)
      .toContain('合计不能超过 30 秒');
    expect(resolveSalesProductionTimeline({ ...depthPlan, videoModel: 'doubao-seedance-2.5' }, source))
      .toMatchObject({ targetDurationSec: 19, changed: false, error: '' });
  });

  it('checks the minimum depth-reference duration after selecting complete actions', () => {
    const tiny = normalizeScriptTemplate({ durationSec: 18, shots: [{ beats: [
      { start: 0, end: 1, action: '短动作' }, { start: 1, end: 18, action: '长动作' },
    ] }] })!;
    const result = resolveSalesProductionTimeline(depthPlan, tiny);
    expect(result.error).toContain('不足当前模型要求的 2 秒');
    expect(result.script).toBe(tiny);
  });

  it('uses resolution and generation-mode specific limits before writing the script', () => {
    const result = resolveSalesProductionTimeline({ ...plan, videoModel: 'veo3.1', videoRefMode: 'omni', videoResolution: '1080P' }, source);
    expect(result).toMatchObject({ targetDurationSec: 8, modelMaxDurationSec: 8, changed: true, error: '' });
  });

  it('rejects an unsupported saved duration without silently replacing it', () => {
    const result = resolveSalesProductionTimeline({ ...plan, videoDurationSec: 17 }, source);
    expect(result).toMatchObject({ targetDurationSec: 17, changed: false });
    expect(result.error).toContain('不支持 17 秒');
    expect(result.script).toBe(source);
  });

  it('keeps a very short complete action at its original duration instead of rounding it down or including a partial next action', () => {
    const tiny = normalizeScriptTemplate({ durationSec: 30, shots: [{ beats: [
      { start: 0, end: 0.1, action: '短动作' }, { start: 0.1, end: 30, action: '长动作' },
    ] }] })!;
    const result = resolveSalesProductionTimeline({ ...plan, videoDurationSec: 4 }, tiny);
    expect(result.error).toBe('');
    expect(result.script.shots[0].beats).toEqual(tiny.shots[0].beats.slice(0, 1));
    expect(result.script.durationSec).toBe(0.1);
    expect(result.targetDurationSec).toBe(4);
  });
});
