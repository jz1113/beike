import type { SalesBeatPurpose, SalesScriptBeat, SalesScriptDomain } from '@shared/domain/sales';
import type { BeatAddress } from './salesScriptEditor';

const PURPOSE_LABELS: Record<SalesBeatPurpose, string> = {
  hook: '开场吸引', showcase: '商品展示', proof: '卖点细节', usage: '使用场景', closing: '结尾收束', other: '动作过渡',
};

export function formatStoryboardTime(seconds: number): string {
  const ticks = Math.round(Math.max(0, seconds) * 10);
  const whole = Math.floor(ticks / 10);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}${ticks % 10 ? `.${ticks % 10}` : ''}`;
}

export interface ScriptStoryboardSegment {
  address: BeatAddress;
  index: number;
  title: string;
  range: string;
  beat: SalesScriptBeat;
  fields: Array<{ label: string; text: string }>;
  prompt: string;
}

/** Read and export the same timeline, including continuous action beats within a real shot. */
export function buildScriptStoryboard(script: SalesScriptDomain): ScriptStoryboardSegment[] {
  const style = [script.visualSpec.styleSummary, script.visualSpec.lighting].filter(Boolean).join('，');
  const subjectFallback = { presenter: '出镜人物展示{{商品}}', hands: '手部与{{商品}}', product: '{{商品}}', mixed: '出镜主体与{{商品}}' }[script.format];
  // Only reusable descriptions enter the prompt; source dialogue and raw observations stay in the reference record.
  const neutralize = (text: string) => {
    const terms = script.sourceExclusions.flatMap((item) => item.term.split(/[、，,/；;\s]+/))
      .map((term) => term.trim()).filter((term) => term.length >= 2).sort((a, b) => b.length - a.length);
    return terms.reduce((result, term) => result.split(term).join('{{商品}}'), text);
  };
  let index = 0;
  return script.shots.flatMap((shot, shotIndex) => shot.beats.map((beat, beatIndex) => {
    const title = shot.beats.length === 1 ? shot.summary || PURPOSE_LABELS[beat.purpose] : PURPOSE_LABELS[beat.purpose];
    const camera = [beat.shotSize, beat.camera || script.visualSpec.cameraFeel].filter(Boolean).join('，');
    const fields = [
      { label: '画面风格', text: style || '未记录画面风格' },
      { label: '主体', text: beat.subject || subjectFallback },
      { label: '动作描述', text: beat.actionTemplate || '待补充动作描述' },
      { label: '镜头变化', text: camera || '未记录镜头变化' },
      { label: '眼神表情', text: beat.expression || (script.format === 'product' || script.format === 'hands' ? '无人物面部出镜' : '未记录眼神表情') },
    ];
    if (beat.scene) fields.push({ label: '场景与光线', text: beat.scene });
    if (beat.transition) fields.push({ label: '衔接方式', text: beat.transition });
    const speech = !script.audioAvailable || beat.voice.mode === 'none'
      ? '无口播，保留自然动作节奏'
      : `${beat.voice.mode === 'voiceover' ? '画外旁白，人物不做说话口型' : '人物自然口播'}${beat.voice.linePattern ? `，按「${beat.voice.linePattern}」填入当前商品已核实的台词` : '，台词使用当前商品已核实的资料'}`;
    const prompt = neutralize([
      `${script.visualSpec.aspectRatio}画幅，时长${Math.round((beat.end - beat.start) * 10) / 10}秒`,
      style, beat.subject || subjectFallback, beat.scene, beat.actionTemplate, camera,
      beat.expression, beat.transition, script.visualSpec.oneTake ? '保持一镜到底的动作衔接，机位与运镜按段落记录执行，不额外增加镜头运动' : '', speech,
      '商品外观以当前商品参考图为准，无水印、无额外字幕',
    ].filter(Boolean).join('。') + '。');
    return { address: { shot: shotIndex, beat: beatIndex }, index: ++index, title,
      range: `${formatStoryboardTime(beat.start)} - ${formatStoryboardTime(beat.end)}`, beat, fields, prompt };
  }));
}

export function exportScriptStoryboard(script: SalesScriptDomain): string {
  return [script.title, script.overview,
    script.visualSpec.oneTake ? '本视频为一镜到底，以下按动作和运镜变化划分分镜段落，不代表真实切镜。' : '以下按镜头切换与动作变化依次拆解。',
    ...buildScriptStoryboard(script).map((segment) => [
      `分镜 ${segment.index}：${segment.title}（${segment.range}）`,
      ...segment.fields.map((field) => `• ${field.label}：${field.text}`),
      '即梦生成提示词（中文）：', segment.prompt,
    ].join('\n')),
  ].filter(Boolean).join('\n\n');
}
