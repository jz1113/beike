import { SALES_IMAGE_VIEW_LABELS } from './types';
import type { SalesScriptDomain } from './scriptTemplate';

const fmtSec = (sec: number): string => {
  const ticks = Math.round(Math.max(0, sec) * 10);
  const whole = Math.floor(ticks / 10);
  const mins = String(Math.floor(whole / 60)).padStart(2, '0');
  const secs = String(whole % 60).padStart(2, '0');
  return `${mins}:${secs}${ticks % 10 ? `.${ticks % 10}` : ''}`;
};

/** Historical export name retained for callers; this is source data, without generation instructions. */
export function previewSeedancePromptSkeleton(script: SalesScriptDomain): string {
  const lines = [
    `分镜资料：${script.title}`,
    `总时长：${script.durationSec} 秒；画幅：${script.visualSpec.aspectRatio}`,
    `镜头结构记录：${script.visualSpec.oneTake ? '一镜到底' : '多镜头'}`,
    `出镜范围记录：${script.assetSlots.persona.presence}`,
    `声音模式记录：${script.voiceMode}；音轨可用：${script.audioAvailable ? '是' : '否'}`,
  ];
  if (script.assetSlots.productViews.length) lines.push(`商品视角记录：${script.assetSlots.productViews.map((view) => SALES_IMAGE_VIEW_LABELS[view]).join('、')}`);
  if (script.visualSpec.styleSummary) lines.push(`画面风格记录：${script.visualSpec.styleSummary}`);
  if (script.visualSpec.lighting) lines.push(`光线记录：${script.visualSpec.lighting}`);
  if (script.visualSpec.cameraFeel) lines.push(`机位记录：${script.visualSpec.cameraFeel}`);
  if (script.visualSpec.moodTags.length) lines.push(`情绪标签记录：${script.visualSpec.moodTags.join('、')}`);
  let index = 1;
  for (const [shotIndex, shot] of script.shots.entries()) {
    for (const [beatIndex, beat] of shot.beats.entries()) {
      const label = script.visualSpec.oneTake ? `动作段 ${index}` : `镜头 ${shotIndex + 1}·动作段 ${beatIndex + 1}`;
      lines.push('', `${label}（${fmtSec(beat.start)} - ${fmtSec(beat.end)}）${shot.summary || beat.shows ? `｜${shot.summary || beat.shows}` : ''}`);
      const fields = [
        ['主体状态', beat.subject], ['动作描述', beat.actionTemplate || beat.action],
        ['景别', beat.shotSize], ['机位', beat.camera], ['场景与光线', beat.scene],
        ['眼神表情', beat.expression], ['段落衔接', beat.transition],
        ['原片动作记录', beat.referenceActionRaw], ['原片台词记录', beat.voice.text],
        ['台词结构记录', beat.voice.linePattern], ['原片字幕记录', beat.subtitle],
      ];
      for (const [label, text] of fields) if (text) lines.push(`• ${label}：${text}`);
      index += 1;
    }
  }
  if (script.sourceExclusions.length) {
    lines.push('', '原片专属元素记录：', ...script.sourceExclusions.map((item) => `• ${item.type}：${item.term}${item.replacementRule ? `（${item.replacementRule}）` : ''}`));
  }
  return lines.join('\n');
}
