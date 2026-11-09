import type { SalesScriptBeat, SalesScriptDomain } from '@shared/domain/sales';

export interface BeatAddress {
  shot: number;
  beat: number;
}

export function formatStoryboardTime(seconds: number): string {
  const ticks = Math.round(Math.max(0, seconds) * 10);
  const whole = Math.floor(ticks / 10);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}${ticks % 10 ? `.${ticks % 10}` : ''}`;
}

export interface ScriptStoryboardSegment {
  address: BeatAddress;
  index: number;
  range: string;
  beat: SalesScriptBeat;
  observedAction: string;
  timeEstimated: boolean;
  prompt: string;
}

function shotNumber(n: number): string {
  const digits = '零一二三四五六七八九';
  if (n < 10) return digits[n];
  const tens = Math.floor(n / 10);
  return (tens === 1 ? '' : digits[tens]) + '十' + (n % 10 ? digits[n % 10] : '');
}

function observations(...values: (string | undefined)[]): string {
  const recorded = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value && !value.includes('{{')));
  return recorded.filter((value, index) => value !== recorded[index - 1]).reduce((text, value) => text + (text && !/[。！？]$/.test(text) ? '。' : '') + value, '');
}

// Older model responses sometimes used English shot-size tokens.
const shotSizeLabels: Record<string, string> = {
  full_shot: '全身景', wide_shot: '远景', long_shot: '远景', medium_shot: '中景',
  medium_close_up: '近景', close_up: '特写', extreme_close_up: '大特写',
};

export function storyboardStyle(script: SalesScriptDomain) {
  return observations(script.visualSpec.styleSummary, script.visualSpec.lighting) || observations(script.overview) || '未记录总体风格';
}

export function buildScriptStoryboard(script: SalesScriptDomain) {
  let index = 0;
  return script.shots.map((shot, shotIndex) => {
    const { analysis, beats } = shot;
    const segments = beats.map((beat, beatIndex): ScriptStoryboardSegment => {
      const camera = [beat.shotSize, beat.camera || script.visualSpec.cameraFeel].filter(Boolean).join('，');
      const style = [script.visualSpec.styleSummary, script.visualSpec.lighting].filter(Boolean).join('，');
      const records = [
        ['画面风格', style], ['主体', beat.subject], ['可复用动作模板', beat.actionTemplate || beat.action],
        ['镜头变化', camera], ['场景与光线', beat.scene], ['眼神表情', beat.expression],
        ['衔接方式', beat.transition], ['原片动作记录', beat.referenceActionRaw],
        ['原片台词记录', beat.voice.text], ['台词结构记录', beat.voice.linePattern], ['原片字幕记录', beat.subtitle],
      ];
      const prompt = [
        `画幅：${script.visualSpec.aspectRatio}；本段时长：${Math.round((beat.end - beat.start) * 10) / 10}秒`,
        `镜头结构记录：${script.visualSpec.oneTake ? '一镜到底' : '多镜头'}`,
        `声音模式记录：${beat.voice.mode}；音轨可用：${script.audioAvailable ? '是' : '否'}`,
        ...records.filter(([, text]) => text).map(([label, text]) => `${label}：${text}`),
      ].join('\n');
      return { address: { shot: shotIndex, beat: beatIndex }, index: ++index, beat, prompt,
        observedAction: observations(beat.referenceActionRaw) || observations(beat.shows) || '未记录本段原片动作',
        timeEstimated: beat.estimated || Boolean(script.sampleTimesSec?.length),
        range: `${formatStoryboardTime(beat.start)} - ${formatStoryboardTime(beat.end)}` };
    });
    return segments.map((segment) => {
      const beat = segment.beat;
      const single = beats.length === 1;
      const fields = [
        { label: '画面风格', text: observations(beat.scene) || observations(analysis?.style) || observations(script.visualSpec.styleSummary) },
        { label: '主体', text: observations(beat.subject) || observations(analysis?.subject) },
        { label: '动作描述', text: observations(beat.referenceActionRaw, beat.shows) || (single ? observations(analysis?.action) : '') },
        { label: '镜头变化', text: observations([beat.shotSize, beat.camera].filter(Boolean).join('，')) || observations(analysis?.camera) },
        { label: '人物神态', text: observations(beat.expression) || observations(analysis?.expression) },
      ].map((field) => ({ ...field, text: field.text || '未记录' }));
      const shotId = String(shotIndex + 1).padStart(2, '0');
      // Older scripts often used a topic label for shows. Prefer the recorded action.
      const rawSize = observations(beat.shotSize).split(/[，。；]/u)[0];
      const size = shotSizeLabels[rawSize.toLowerCase().replace(/[- ]/g, '_')] ?? rawSize;
      const setup = (observations(beat.camera) || observations(analysis?.camera)).split(/[。；]/u)[0];
      const camera = observations(beat.cameraLabel) || [...new Set([size, setup].filter(Boolean))].join('，') || '未记录';
      const action = observations(beat.referenceActionRaw) || observations(beat.shows)
        || (single ? observations(shot.summary, analysis?.action) : '') || '未记录';
      const notes = [
        ['主体', beat.subject], ['场景', beat.scene], ['神态', beat.expression],
        ['台词', script.audioAvailable && !script.sampleTimesSec?.length ? beat.voice.text : ''],
        ['字幕', beat.subtitle], ['衔接', beat.transition],
      ].map(([label,value]) => ({label, text: observations(value)}))
        .filter(note => note.text && !/^(?:none|n\/a|无|未记录|无变化)[。.]?$/i.test(note.text) && !action.includes(note.text));
      const duration = Math.round((beat.end - beat.start) * 10) / 10;
      return { number: single ? shotId : `${shotId}.${segment.address.beat + 1}`, camera, action, notes,
        sectionLabel: beat.sectionLabel || '', duration, index: segment.index, title: `分镜${shotNumber(segment.index)}`, range: segment.range,
        estimated: segment.timeEstimated || shot.estimated, fields, segments: [segment] };
    });
  }).flat();
}

export const storyboardColumns = ['镜号', '时间 / 时长', '画面与动作', '镜头方式'] as const;

type StoryboardRow = ReturnType<typeof buildScriptStoryboard>[number];

export function commonStoryboardNotes(rows: StoryboardRow[]) {
  if (rows.length < 2) return [];
  return rows[0].notes.filter(({label,text}) =>
    ['主体', '场景', '字幕'].includes(label) && rows.every(row => row.notes.some(note => note.label === label && note.text === text)));
}

export function rowStoryboardNotes(row: StoryboardRow, common: StoryboardRow['notes']) {
  return row.notes.filter(note => !common.some(shared => shared.label === note.label));
}

export function storyboardSections(rows: StoryboardRow[]) {
  const sections: {label: string; rows: StoryboardRow[]}[] = [];
  for (const row of rows) {
    const previous = sections.at(-1);
    if (previous && previous.label === row.sectionLabel) previous.rows.push(row);
    else sections.push({label: row.sectionLabel, rows: [row]});
  }
  return sections;
}

export function sectionCaption(section: ReturnType<typeof storyboardSections>[number], index: number) {
  const first = section.rows[0].segments[0].beat, last = section.rows.at(-1)!.segments[0].beat;
  return `第 ${index+1} 段 · ${section.label || '全片'}（${first.start}–${last.end} 秒，${section.rows.length} 行）`;
}
