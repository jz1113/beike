import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { updateBeat } from './salesScriptEditor';
import { buildScriptStoryboard, exportScriptStoryboard, formatStoryboardTime } from './salesScriptStoryboard';

const sample = () => normalizeScriptTemplate({
  title: '自然光商品展示', durationSec: 12.4,
  visualSpec: { oneTake: true, styleSummary: '日系胶片质感', lighting: '窗边自然柔光' },
  shots: [{ start: 0, end: 12.4, summary: '连续展示', beats: [
    { start: 0, end: 5.1, purpose: 'hook', subject: '人物展示{{商品}}', actionTemplate: '双手轻抚{{商品}}', camera: '手持跟随', expression: '直视镜头，轻轻微笑', scene: '木质车厢', transition: '随动作自然衔接', voice: { mode: 'speech', text: '原片独有广告词', linePattern: '[开场惊叹]' } },
    { start: 5.1, end: 12.4, purpose: 'showcase', actionTemplate: '侧身展示{{商品}}' },
  ] }],
})!;

describe('script storyboard reading and export', () => {
  it('formats timestamps with tenths and handles minute carry', () => {
    expect([0, 5.1, 59.96, 600].map(formatStoryboardTime)).toEqual(['00:00', '00:05.1', '01:00', '10:00']);
  });

  it('numbers continuous beats and real cuts sequentially without modifying the stored timeline', () => {
    const script = sample();
    const before = JSON.stringify(script);
    script.shots.push({ ...script.shots[0], start: 12.4, end: 14, summary: '结尾定格', beats: [{ ...script.shots[0].beats[1], start: 12.4, end: 14 }] });
    const segments = buildScriptStoryboard(script);
    expect(segments.map((segment) => segment.index)).toEqual([1, 2, 3]);
    expect(segments[1]).toMatchObject({ address: { shot: 0, beat: 1 }, range: '00:05.1 - 00:12.4' });
    expect(segments[2]).toMatchObject({ address: { shot: 1, beat: 0 }, title: '结尾定格' });
    expect(segments[0].fields.map((field) => field.label)).toEqual(['画面风格', '主体', '动作描述', '镜头变化', '眼神表情', '场景与光线', '衔接方式']);
    script.shots.pop();
    expect(JSON.stringify(script)).toBe(before);
  });

  it('builds a complete reusable Chinese prompt and follows live edits', () => {
    const script = sample();
    const prompt = buildScriptStoryboard(script)[0].prompt;
    for (const text of ['5.1秒', '日系胶片质感', '窗边自然柔光', '人物展示{{商品}}', '木质车厢', '双手轻抚{{商品}}', '手持跟随', '直视镜头', '[开场惊叹]', '一镜到底']) expect(prompt).toContain(text);
    expect(prompt).not.toContain('原片独有广告词');
    const edited = updateBeat(script, { shot: 0, beat: 0 }, { actionTemplate: '抬手指向{{商品细节}}', expression: '低头浅笑' });
    const updated = buildScriptStoryboard(edited)[0];
    expect(updated.prompt).toContain('抬手指向{{商品细节}}');
    expect(updated.prompt).toContain('低头浅笑');
    expect(updated.prompt).not.toContain('双手轻抚');
  });

  it('removes source exclusions from every generated prompt field and keeps raw records out', () => {
    const script = sample();
    script.sourceExclusions = [{ type: 'brand_signage', term: '原片品牌、私人配饰', replacementRule: '替换' }];
    const beat = script.shots[0].beats[0];
    Object.assign(beat, { subject: '原片品牌', scene: '私人配饰', referenceActionRaw: '原片观察专属内容', subtitle: '原片字幕' });
    const prompt = buildScriptStoryboard(script)[0].prompt;
    for (const raw of ['原片品牌', '私人配饰', '原片观察专属内容', '原片字幕']) expect(prompt).not.toContain(raw);
    expect(prompt).toContain('{{商品}}');
  });

  it('respects silent and voiceover modes and provides honest missing-field fallbacks', () => {
    const script = sample();
    const beat = script.shots[0].beats[0];
    beat.voice.mode = 'voiceover';
    expect(buildScriptStoryboard(script)[0].prompt).toContain('画外旁白，人物不做说话口型');
    script.audioAvailable = false;
    expect(buildScriptStoryboard(script)[0].prompt).toContain('无口播');
    const second = buildScriptStoryboard(script)[1];
    expect(second.fields.find((field) => field.label === '眼神表情')?.text).toBe('未记录眼神表情');
    expect(second.prompt).not.toContain('未记录');
  });

  it('copies the full reading format with precise timestamps and each segment prompt', () => {
    const script = sample();
    const exported = exportScriptStoryboard(script);
    expect(exported).toContain('不代表真实切镜');
    expect(exported).toContain('分镜 2：商品展示（00:05.1 - 00:12.4）');
    expect(exported).toContain('• 画面风格：日系胶片质感，窗边自然柔光');
    expect(exported.match(/即梦生成提示词（中文）/g)).toHaveLength(2);
    expect(exported).not.toContain('原片独有广告词');
  });
});
