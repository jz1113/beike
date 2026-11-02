import { SALES_IMAGE_VIEW_LABELS, type SalesProductImageView } from './types';
import type { SalesScriptDomain } from './scriptTemplate';
import { sanitizeVideoMotionText } from './promptAssembler';

const fmtSec = (sec: number): string => {
  const ticks = Math.round(Math.max(0, sec) * 10);
  const whole = Math.floor(ticks / 10);
  const mins = String(Math.floor(whole / 60)).padStart(2, '0');
  const secs = String(whole % 60).padStart(2, '0');
  return `${mins}:${secs}${ticks % 10 ? `.${ticks % 10}` : ''}`;
};

export function previewSeedancePromptSkeleton(script: SalesScriptDomain): string {
  let mixedIdx = 1;
  const personaAnchors: string[] = [];
  if (script.assetSlots.persona.required) {
    if (script.assetSlots.persona.presence === 'hands_only') {
      personaAnchors.push(`手部参考 {{Mixed ${mixedIdx++}}}`);
    } else {
      personaAnchors.push(`出镜人物主体 {{Mixed ${mixedIdx++}}}`);
      if (script.assetSlots.persona.anchorsNeeded.includes('face')) {
        personaAnchors.push(`人脸参考 {{Mixed ${mixedIdx++}}}`);
      }
    }
  }
  const viewSlots = new Map<SalesProductImageView, string>();
  const views = script.assetSlots.productViews.length ? script.assetSlots.productViews : (['front'] as SalesProductImageView[]);
  for (const view of views) {
    viewSlots.set(view, `{{Mixed ${mixedIdx++}}}`);
  }
  const primaryProductRef = [...viewSlots.values()][0] || `{{Mixed ${mixedIdx++}}}`;
  const sceneRef = `{{Mixed ${mixedIdx}}}`;
  const productDesc = [...viewSlots.entries()].map(([v, ref]) => `${SALES_IMAGE_VIEW_LABELS[v]}参考 ${ref}`).join('、');
  const headerSubject = personaAnchors.length
    ? `${personaAnchors.join('，')}，展示当前商品（${productDesc}），严格保持商品外观、色彩、材质与结构一致`
    : `商品主体（${productDesc}），严格保持商品外观、色彩、材质与结构一致`;
  const sceneText = script.assetSlots.scene.categoryTags.join('、') || '与参考脚本空间类型相符的环境';
  const cutLabel = script.visualSpec.oneTake ? '一镜到底（不切镜，机位与运镜按动作段记录执行）' : '按真实镜头边界剪辑，同一镜头内动作段不额外切镜';
  const mood = script.visualSpec.moodTags.join('、') || '沿用参考脚本的情绪和节奏';
  const lines = [
    `画面描述：${headerSubject}。场景参考 ${sceneRef}（${sceneText}），确定空间结构与陈设，摄影画风与打光优先按参考脚本执行。`,
    `动作与镜头：${script.visualSpec.aspectRatio} 画幅，${script.visualSpec.styleSummary || '沿用参考脚本已记录的摄影质感'}，${script.visualSpec.lighting || '保持当前环境中一致的光源方向与曝光'}，${cutLabel}${script.visualSpec.cameraFeel ? `，${script.visualSpec.cameraFeel}` : ''}。`,
    `氛围与情绪：${mood}。`,
    '',
  ];
  let idx = 1;
  for (const [shotIndex, shot] of script.shots.entries()) {
    for (const [beatIndex, beat] of shot.beats.entries()) {
      const viewRef = beat.requiredView !== 'any' ? viewSlots.get(beat.requiredView) || primaryProductRef : primaryProductRef;
      const label = script.visualSpec.oneTake ? `动作段 ${idx}` : `镜头 ${shotIndex + 1}·动作段 ${beatIndex + 1}`;
      lines.push(`${label}（${fmtSec(beat.start)} - ${fmtSec(beat.end)}）｜${shot.summary || beat.shows || '卖点展示'}`);
      const camera = beat.camera || script.visualSpec.cameraFeel;
      lines.push(`• 镜头变化：${beat.shotSize}${camera ? `，${camera}` : ''}。`);
      if (beat.subject) lines.push(`• 主体状态：${beat.subject}。`);
      lines.push(`• 动作描述：${beat.actionTemplate}（关联商品 ${viewRef}）。`);
      if (beat.scene) lines.push(`• 段落空间与光线关系：${beat.scene}（空间实体替换为当前场景）。`);
      if (beat.transition) lines.push(`• 段落衔接：${beat.transition}。`);
      if (beat.expression) lines.push(`• 眼神表情：${beat.expression}。`);
      if (beat.voice.mode === 'speech' && beat.voice.linePattern) {
        lines.push(`• 口播槽位：按「${beat.voice.linePattern}」配当前商品口语台词。`);
      }
      idx += 1;
    }
  }
  const audioTail = script.voiceMode === 'speech'
    ? '声音要求：人物自然口播讲解当前商品卖点，不自带杂乱背景音乐；无画面字幕、无水印、无原片品牌标识。'
    : '声音要求：画面人物不张嘴说话，保持纯净画面供后期合成音色库旁白与无版权商用 BGM；无画面字幕、无水印、无品牌标识。';
  lines.push('', audioTail);
  return sanitizeVideoMotionText(lines.join('\n'), script, '{{商品}}', undefined, true);
}
