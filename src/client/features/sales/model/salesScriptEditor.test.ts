import { describe, expect, it } from 'vitest';
import { detectExclusionLeaks, normalizeScriptTemplate, validateScriptTemplate } from '@shared/domain/sales';
import { addExclusion, deleteBeat, mergeBeatWithNext, replaceExclusionLeak, scriptBeatCount, splitBeat, updateBeat } from './salesScriptEditor';

const base = () => normalizeScriptTemplate({ title: '街拍一镜到底', durationSec: 6, shots: [{ start: 0, end: 6, beats: [
  { start: 0, end: 2, action: '侧身指向徽标', voice: { mode: 'speech', text: '这个外壳' } },
  { start: 2, end: 6, action: '推近捏衣襟' },
] }] })!;

describe('sales script editor', () => {
  it('splits and merges beats without breaking the continuous shot', () => {
    const split = splitBeat(base(), { shot: 0, beat: 1 });
    expect(scriptBeatCount(split)).toBe(3);
    expect(split.shots[0].beats[2]).toMatchObject({ start: 4, end: 6, estimated: true });
    expect(validateScriptTemplate(split)).toEqual([]);
    const merged = mergeBeatWithNext(split, { shot: 0, beat: 1 });
    expect(scriptBeatCount(merged)).toBe(2);
    expect(merged.shots[0].beats[1]).toMatchObject({ start: 2, end: 6, actionTemplate: '推近捏衣襟；推近捏衣襟' });
  });

  it('rounds edited seconds and expands the owning shot', () => {
    const edited = updateBeat(base(), { shot: 0, beat: 1 }, { end: 6.84, actionTemplate: '推近抚触{{商品细节部位}}' });
    expect(edited.shots[0].beats[1]).toMatchObject({ end: 6.8, action: '推近抚触{{商品细节部位}}' });
    expect(edited.shots[0].end).toBe(6.8);
  });

  it('keeps at least one beat and fixes leaked source terms', () => {
    const single = deleteBeat(deleteBeat(base(), { shot: 0, beat: 0 }), { shot: 0, beat: 0 });
    expect(scriptBeatCount(single)).toBe(1);
    const leaked = addExclusion(base(), { type: 'brand_signage', term: '徽标', replacementRule: '剔除' });
    expect(detectExclusionLeaks(leaked)).toHaveLength(1);
    expect(detectExclusionLeaks(replaceExclusionLeak(leaked, '徽标', '{{商品细节亮点}}'))).toEqual([]);
  });
});
