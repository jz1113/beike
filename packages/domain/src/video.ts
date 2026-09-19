/**
 * AI 视频生成模型与参数适配引擎
 * 对齐 /v2/videos/generations 规范接口与各大旗舰视频大模型
 */

import { listApprovedModels, vendorLabel, type VideoAudioSupportType } from '@beike/domain/modelCatalog';

export type { VideoAudioSupportType };

export interface VideoGenModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  isPrimary?: boolean;
  isNew?: boolean;
  isVip?: boolean;
  badge?: string;
  description: string;
  supportedDurations: number[]; // e.g. [4, 5, 8, 10]
  supportedResolutions: ('480P' | '720P' | '1080P' | '4K')[];
  supportedAspectRatios: string[];
  audioSupport?: VideoAudioSupportType;
}

export const VIDEO_GEN_MODELS: VideoGenModel[] = listApprovedModels('video').map((m) => ({
  id: m.id,
  name: m.name,
  shortName: m.shortName,
  provider: vendorLabel(m.vendor),
  isPrimary: m.isPrimary,
  badge: m.badge,
  description: m.description || m.name,
  supportedDurations: m.supportedDurations || [4, 5, 8, 10],
  supportedResolutions: m.supportedResolutions || ['720P', '1080P'],
  supportedAspectRatios: m.supportedAspectRatios || ['16:9', '9:16', '1:1'],
  audioSupport: m.audioSupport,
}));

export interface VideoAspectRatioItem {
  id: string;
  label: string;
  ratio: string;
  iconType: string;
}

export const VIDEO_ASPECT_RATIOS: VideoAspectRatioItem[] = [
  { id: '21:9', label: '21:9', ratio: '21:9', iconType: 'ultrawide' },
  { id: '16:9', label: '16:9', ratio: '16:9', iconType: 'wide169' },
  { id: '4:3', label: '4:3', ratio: '4:3', iconType: 'wide43' },
  { id: '1:1', label: '1:1', ratio: '1:1', iconType: 'square' },
  { id: '3:4', label: '3:4', ratio: '3:4', iconType: 'tall34' },
  { id: '9:16', label: '9:16', ratio: '9:16', iconType: 'tall916' }
];

export interface VideoRefModeItem {
  id: string;
  name: string;
  desc: string;
  tag?: string;
  badge?: string;
}

export const VIDEO_REF_MODES: VideoRefModeItem[] = [
  {
    id: 'omni',
    name: '全能参考',
    desc: '自动识别参考图内容，融合主体人物、商品、场景或动作进行智能演绎',
    tag: '默认推荐'
  },
  {
    id: 'first_last_frame',
    name: '首尾帧',
    desc: '指定第1帧起始图与最终帧结束图，精准控制过渡镜头的起承转合',
    tag: '起承转合'
  },
  {
    id: 'multi_frame',
    name: '智能多帧',
    desc: '上传 2-6 张关键帧序列，大模型沿时间线自然补齐中间动态过程',
    tag: '多镜头'
  }
];

export const VIDEO_RESOLUTIONS: ('480P' | '720P' | '1080P' | '4K')[] = ['480P', '720P', '1080P', '4K'];
export const VIDEO_DURATIONS: number[] = [4, 5, 8, 10, 15, 30];

/** 按模型 id 查找视频模型配置 */
export function getVideoModelById(modelId?: string | null): VideoGenModel | undefined {
  if (!modelId) return undefined;
  const m = modelId.toLowerCase().trim();
  return (
    VIDEO_GEN_MODELS.find((x) => x.id.toLowerCase() === m) ||
    VIDEO_GEN_MODELS.find((x) => m.includes(x.id.toLowerCase()) || x.id.toLowerCase().includes(m)) ||
    VIDEO_GEN_MODELS.find((x) => {
      const short = x.id.replace(/^doubao-/, '').toLowerCase();
      return m.includes(short) || short.includes(m.replace(/^doubao-/, ''));
    })
  );
}

/**
 * 按模型钳制时长：禁止再把任意秒数硬编码折叠成仅 5/10。
 * Seedance 2.5 等支持 4–15（乃至更长）时应原样透传。
 */
export function clampVideoDuration(modelId: string | undefined, duration: number): number {
  const requested = Math.round(Number(duration));
  const fallback = Number.isFinite(requested) && requested > 0 ? requested : 5;
  const model = getVideoModelById(modelId);
  const allowed =
    model?.supportedDurations?.length
      ? [...model.supportedDurations].sort((a, b) => a - b)
      : [4, 5, 8, 10, 15];

  if (allowed.includes(fallback)) return fallback;

  // 就近吸附到该模型支持的时长
  return allowed.reduce((best, cur) =>
    Math.abs(cur - fallback) < Math.abs(best - fallback) ? cur : best
  , allowed[0]);
}

/** 模型支持的最短/最长时长（供 UI 滑块） */
export function getVideoDurationBounds(modelId?: string | null): { min: number; max: number; allowed: number[] } {
  const model = getVideoModelById(modelId);
  const allowed =
    model?.supportedDurations?.length
      ? [...model.supportedDurations].sort((a, b) => a - b)
      : [4, 5, 8, 10, 15];
  return { min: allowed[0], max: allowed[allowed.length - 1], allowed };
}
