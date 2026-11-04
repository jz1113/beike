import { getVideoModelById, resolveVideoResolution } from '@shared/domain/media/video';
import { getGatewayClientBaseUrl } from '@client/shared/api/gatewayClient';
import { resolveVideoMode, videoDurationOptions } from '@shared/domain/media/videoCapabilities';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import type { SalesReferenceSlot, SalesScriptDomain } from '@shared/domain/sales';
import type { SalesProductionPlanState } from './salesProductionDraft';
import { salesDepthVideoLimits } from './salesDepthVideoLimits';

export interface SalesProductionTimeline {
  script: SalesScriptDomain;
  sourceDurationSec: number;
  targetDurationSec: number;
  modelMaxDurationSec: number;
  changed: boolean;
  /** Later action beats are omitted; the retained final beat must not lead into them. */
  truncatedEnding: boolean;
  notice: string;
  error: string;
  /** The original, unretimed depth video must be clipped to this complete-action boundary. */
  depthClipEndSec?: number;
}

/** Derive production timing without modifying the reference script stored in the library. */
export function resolveSalesProductionTimeline(
  plan: SalesProductionPlanState,
  source: SalesScriptDomain,
  references: readonly SalesReferenceSlot[] = [],
  baseUrl = getGatewayClientBaseUrl(plan.videoModel),
): SalesProductionTimeline {
  const model = upstreamModalityModelId('video', plan.videoModel);
  const profile = getVideoModelById(model, baseUrl);
  const resolution = resolveVideoResolution(plan.videoResolution || '720P', profile?.supportedResolutions);
  const depth = plan.imitationMode === 'depth_imitation' && plan.scriptVideoReference === 'depth';
  const imageCount = references.length ? references.filter((slot) => slot.mediaType !== 'video').length : 1;
  const videoCount = references.length ? references.filter((slot) => slot.mediaType === 'video').length : depth ? 1 : 0;
  const mode = resolveVideoMode(model, plan.videoRefMode || 'omni', imageCount, videoCount);
  const durations = [...new Set(videoDurationOptions(model, resolution, mode, baseUrl))]
    .filter((duration) => Number.isFinite(duration) && duration > 0).sort((a, b) => a - b);
  const beats = source.shots.flatMap((shot) => shot.beats);
  const sourceDurationSec = Math.max(source.durationSec, 0, ...source.shots.map((shot) => shot.end), ...beats.map((beat) => beat.end));
  const modelMaxDurationSec = durations.at(-1) || 0;
  let targetDurationSec = plan.videoDurationSec || durations.find((duration) => duration >= Math.ceil(sourceDurationSec)) || modelMaxDurationSec;
  const referenceMin = salesDepthVideoLimits(model, targetDurationSec).min;
  const motionBudget = (duration: number) => Math.min(duration, salesDepthVideoLimits(model, duration).max);
  if (depth && !plan.videoDurationSec && motionBudget(targetDurationSec) < sourceDurationSec) {
    targetDurationSec = durations.reduce((best, duration) => motionBudget(duration) > motionBudget(best) ? duration : best, durations[0] || 0);
  }
  const base: SalesProductionTimeline = {
    script: source, sourceDurationSec, targetDurationSec, modelMaxDurationSec,
    changed: false, truncatedEnding: false, notice: '', error: '',
  };
  if (!durations.length) return { ...base, error: '所选视频模型没有可用时长，请重新选择模型或生成方式。' };
  if (plan.videoDurationSec && !durations.includes(plan.videoDurationSec)) {
    return { ...base, error: `所选视频模型不支持 ${plan.videoDurationSec} 秒，请重新选择生成时长。` };
  }
  if (!beats.length || !Number.isFinite(sourceDurationSec) || sourceDurationSec <= 0) {
    return { ...base, error: '当前脚本没有有效动作时间轴，请先补充分镜起止时间。' };
  }
  const contentBudget = depth ? motionBudget(targetDurationSec) : targetDurationSec;
  if (depth && contentBudget < referenceMin) {
    return { ...base, error: referenceMin === 1
      ? `万相 3.0 的参考视频与成片合计不能超过 30 秒，当前 ${targetDurationSec} 秒成片无法容纳有效的动作参考，请缩短成片时长。`
      : `当前模型的动作参考至少需要 ${referenceMin} 秒，请选择更长生成时长。` };
  }
  if (depth && sourceDurationSec < referenceMin) return { ...base, error: `当前模型的深度视频参考至少需要 ${referenceMin} 秒，请选择更长的参考脚本。` };
  if (sourceDurationSec <= contentBudget) return base;

  if (depth) {
    let remaining = 0;
    let end = 0;
    for (const beat of beats) {
      if (beat.end > contentBudget) break;
      if (!Number.isFinite(beat.start) || !Number.isFinite(beat.end) || beat.start < 0 || beat.end <= beat.start) {
        return { ...base, error: '深度视频的动作段时间无效，请先修正参考脚本。' };
      }
      remaining += 1;
      end = Math.max(end, beat.end);
    }
    if (!remaining) {
      return { ...base, error: `第一个完整动作段已超过当前可用的 ${contentBudget} 秒动作参考时长；请换用更长时长的视频模型，或先拆分参考脚本的动作段。深度视频动作不会加速或从中截断。` };
    }
    if (end < referenceMin) return { ...base, error: `保留的完整动作段只有 ${end} 秒，不足当前模型要求的 ${referenceMin} 秒参考时长；请换用其他模型或调整参考脚本。` };
    let retained = 0;
    const shots = source.shots.flatMap((shot) => {
      const kept = shot.beats.slice(0, Math.max(0, remaining - retained));
      retained += kept.length;
      return kept.length ? [{ ...shot, end: Math.min(shot.end, end), beats: kept }] : [];
    });
    const outputDuration = plan.videoDurationSec || durations.find((duration) => duration >= Math.ceil(end) && motionBudget(duration) >= end) || targetDurationSec;
    return {
      ...base,
      targetDurationSec: outputDuration,
      script: { ...source, durationSec: end, shots },
      changed: true,
      truncatedEnding: remaining < beats.length,
      depthClipEndSec: end,
      notice: `原脚本 ${sourceDurationSec} 秒，按模型的生成与参考时长限制保留前 ${remaining} 个完整动作段至 ${end} 秒，原速度播放；成片 ${outputDuration} 秒，余时自然收势。原脚本与原视频已保留。`,
    };
  }

  let remaining = 0;
  let end = 0;
  for (const beat of beats) {
    if (beat.end > contentBudget) break;
    if (!Number.isFinite(beat.start) || !Number.isFinite(beat.end) || beat.start < 0 || beat.end <= beat.start) {
      return { ...base, error: '当前脚本的动作段时间无效，请先修正参考脚本。' };
    }
    remaining += 1;
    end = Math.max(end, beat.end);
  }
  if (!remaining) {
    return { ...base, error: `第一个完整动作段已超过当前可用的 ${contentBudget} 秒；请换用更长时长的视频模型，或先拆分参考脚本的动作段。本次不会加速或从中截断动作。` };
  }
  let retained = 0;
  const shots = source.shots.flatMap((shot) => {
    const kept = shot.beats.slice(0, Math.max(0, remaining - retained));
    retained += kept.length;
    return kept.length ? [{ ...shot, end: Math.min(shot.end, end), beats: kept }] : [];
  });
  const outputDuration = plan.videoDurationSec || durations.find((duration) => duration >= Math.ceil(end)) || targetDurationSec;
  return {
    ...base,
    targetDurationSec: outputDuration,
    script: { ...source, durationSec: end, shots },
    changed: true,
    truncatedEnding: remaining < beats.length,
    notice: `原脚本 ${sourceDurationSec} 秒，本次保留前 ${remaining}/${beats.length} 个完整动作段至 ${end} 秒，保留原动作时序；${remaining < beats.length ? `后续 ${beats.length - remaining} 段本次不生成，` : ''}口播与字幕仅按保留段适配。成片 ${outputDuration} 秒，余时自然收势。原脚本与手动修改已保留。`,
  };
}
