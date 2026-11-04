import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { updateBeat } from './salesScriptEditor';
import { buildScriptStoryboard, exportScriptRecords, exportScriptStoryboard, formatStoryboardTime } from './salesScriptStoryboard';

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
    const shots = buildScriptStoryboard(script);
    expect(shots.map((shot) => shot.title)).toEqual(['分镜一', '分镜二', '分镜三']);
    expect(shots[1].segments[0]).toMatchObject({ address: { shot: 0, beat: 1 }, range: '00:05.1 - 00:12.4' });
    expect(shots.map((shot) => shot.number)).toEqual(['01.1', '01.2', '02']);
    expect(shots[2]).toMatchObject({ index: 3, range: '00:12.4 - 00:14' });
    expect(shots[0].fields.map((field) => field.label)).toEqual(['画面风格', '主体', '动作描述', '镜头变化', '人物神态']);
    script.shots.pop();
    expect(JSON.stringify(script)).toBe(before);
  });

  it('exports recorded storyboard fields and follows live edits without adding generation instructions', () => {
    const script = sample();
    const prompt = buildScriptStoryboard(script)[0].segments[0].prompt;
    for (const text of ['5.1秒', '日系胶片质感', '窗边自然柔光', '人物展示{{商品}}', '木质车厢', '双手轻抚{{商品}}', '手持跟随', '直视镜头', '[开场惊叹]', '一镜到底']) expect(prompt).toContain(text);
    expect(prompt).toContain('原片台词记录：原片独有广告词');
    for (const added of ['无水印', '无额外字幕', '不额外增加镜头运动', '填入当前商品']) expect(prompt).not.toContain(added);
    const edited = updateBeat(script, { shot: 0, beat: 0 }, { actionTemplate: '抬手指向{{商品细节}}', expression: '低头浅笑' });
    const updated = buildScriptStoryboard(edited)[0].segments[0];
    expect(updated.prompt).toContain('抬手指向{{商品细节}}');
    expect(updated.prompt).toContain('低头浅笑');
    expect(updated.prompt).not.toContain('双手轻抚');
  });

  it('preserves source entities and raw observations as records rather than replacing them with invented product instructions', () => {
    const script = sample();
    script.sourceExclusions = [{ type: 'brand_signage', term: '原片品牌、私人配饰', replacementRule: '替换' }];
    const beat = script.shots[0].beats[0];
    Object.assign(beat, { subject: '原片品牌', scene: '私人配饰', referenceActionRaw: '原片观察专属内容', subtitle: '原片字幕' });
    const prompt = buildScriptStoryboard(script)[0].segments[0].prompt;
    for (const raw of ['主体：原片品牌', '场景与光线：私人配饰', '原片动作记录：原片观察专属内容', '原片字幕记录：原片字幕']) expect(prompt).toContain(raw);
    expect(exportScriptRecords(script)).toContain('原片专属元素记录：');
    expect(exportScriptRecords(script)).toContain('brand_signage：原片品牌、私人配饰（替换）');
  });

  it('records voice mode and audio availability without inventing mouth or speech directions', () => {
    const script = sample();
    const beat = script.shots[0].beats[0];
    beat.voice.mode = 'voiceover';
    expect(buildScriptStoryboard(script)[0].segments[0].prompt).toContain('声音模式记录：voiceover；音轨可用：是');
    script.audioAvailable = false;
    expect(buildScriptStoryboard(script)[0].segments[0].prompt).toContain('声音模式记录：voiceover；音轨可用：否');
    expect(buildScriptStoryboard(script)[0].segments[0].prompt).not.toContain('人物不做说话口型');
    expect(buildScriptStoryboard(script)[1].segments[0].prompt).not.toContain('未记录');
  });

  it('copies the full reading format with precise timestamps and source records', () => {
    const script = sample();
    script.shots[0].beats[0].referenceActionRaw = '她拿起卡片';
    script.shots[0].beats[0].shows = '开场律动';
    script.shots[0].beats.forEach(beat=>{beat.subtitle='同一条屏幕字幕';});
    script.sampleTimesSec = [0, 5.1, 11.8];
    script.shots[0].beats[1].shows = '她转身面向窗户';
    const exported = exportScriptStoryboard(script);
    expect(exported).toContain('### 视频总体风格');
    expect(exported).toContain('### 分镜总览（12.4 秒 · 1 个镜头 · 2 行）');
    expect(exported).toContain('| 镜号 | 时间 / 时长 | 画面与动作 | 镜头方式 |');
    expect(exported).toContain('| 01.1 | 00:00 - 00:05.1（约 5.1 秒） | 她拿起卡片');
    expect(exported).toContain('| 01.2 | 00:05.1 - 00:12.4（约 7.3 秒） | 她转身面向窗户 | 中景 |');
    expect(exported.match(/同一条屏幕字幕/g)).toHaveLength(1);
    expect(exported).not.toContain('开场律动');
    expect(exported).not.toMatch(/原片独有广告词|分镜资料|开场吸引|\{\{商品/);
    Object.assign(script.shots[0].beats[0], { sectionLabel:'车内' });
    Object.assign(script.shots[0].beats[1], { sectionLabel:'窗边', cameraLabel:'侧面跟拍', shows:'经过栏杆 | 看向窗外' });
    const grouped = exportScriptStoryboard(script);
    expect(grouped).toContain('第 2 段 · 窗边（5.1–12.4 秒，1 行）');
    expect(grouped).toContain('经过栏杆 \\| 看向窗外 | 侧面跟拍');
  });
});
