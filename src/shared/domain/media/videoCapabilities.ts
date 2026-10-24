import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { getVideoModelById } from './video';

export const VIDEO_GENERATION_MODES = [
  { id: 'omni', name: '全能参考', desc: '参考图片或视频的主体、场景或动作' },
  { id: 'first_frame', name: '首帧生视频', desc: '以一张图片作为视频的第一帧' },
  { id: 'first_last_frame', name: '首尾帧', desc: '两张图片分别指定起点与终点' },
  { id: 'text', name: '文生视频', desc: '用文字描述主体、动作与镜头' },
  { id: 'edit', name: '视频编辑', desc: '描述原视频中需要修改的内容' },
  { id: 'extend', name: '视频延长', desc: '描述原视频之后发生的内容' },
];

export const isSeedance25 = (id: string) => /seedance-2[.-]5/i.test(id);
export const isSeedance = (id: string) => /seedance/i.test(id);

const FULL_MODES = ['omni', 'first_frame', 'first_last_frame', 'text'];
const FRAME_MODES = ['first_frame', 'first_last_frame', 'text'];
const SEEDANCE_MODES = ['omni', 'first_frame', 'first_last_frame', 'text', 'edit', 'extend'];

/** Expose modes with an implemented payload path, not every vendor marketing feature. */
export function videoModeIds(model: string) {
  const id = canonicalModelId(model).toLowerCase();
  if (/seedance/.test(id)) return SEEDANCE_MODES;
  if (id === 'viduq3' || id === 'viduq3-mix') return ['omni'];
  if (id === 'viduq3-turbo' || id === 'viduq3-pro' || id === 'viduq4-preview') return FULL_MODES;
  if (/omni[_-]flash|gemini-omni/.test(id)) return SEEDANCE_MODES;
  if (/^veo3\.1/.test(id)) return FULL_MODES;
  if (/sora/.test(id)) return ['first_frame', 'text'];
  if (/grok/.test(id)) return [...FULL_MODES, 'edit', 'extend'];
  if (/kling/.test(id)) return id.includes('omni') ? FULL_MODES : FRAME_MODES;
  if (/wan/.test(id)) return FULL_MODES;
  if (/minimax|hailuo/.test(id) || id === 'h3') return FULL_MODES;
  return ['first_frame', 'text'];
}

export function videoModes(model: string) {
  const id = model.toLowerCase();
  return VIDEO_GENERATION_MODES.filter(mode => videoModeIds(model).includes(mode.id)).map(mode => {
    if (mode.id !== 'omni') return mode;
    if (/minimax|hailuo/.test(id) || id === 'h3') return { ...mode, desc: '可混合参考图片与视频，一张参考图也不会被当成首帧' };
    if (isSeedance(id)) return { ...mode, desc: '全模态参考图片或视频；一张参考图也不会被当成首帧' };
    if (/omni[_-]flash|gemini-omni/.test(id)) return { ...mode, desc: '最多 7 张参考图、3 个参考视频，支持多模态参考' };
    if (/^veo3\.1/.test(id)) return { ...mode, desc: '最多 3 张参考图，不能与首尾帧同时使用' };
    if (/grok/.test(id)) return { ...mode, desc: '最多 14 张参考图，不锁定为首帧' };
    return mode;
  });
}

export function videoModeLabel(mode?: string) {
  return VIDEO_GENERATION_MODES.find(item => item.id === mode)?.name || '全能参考';
}

export function resolveVideoMode(model: string, mode: string | undefined = undefined, imageCount = 0, videoCount = 0) {
  if (!mode) {
    const preferred = videoCount || imageCount > 2 ? 'omni' : imageCount === 2 ? 'first_last_frame' : imageCount === 1 ? 'first_frame' : 'text';
    return videoModes(model).some(item => item.id === preferred) ? preferred : videoModes(model)[0].id;
  }
  const normalized = ['multi_frame', 'reference_image'].includes(mode) ? 'omni' : mode;
  // Old sessions used omni for every model, including models with only text / first-frame inputs.
  if (normalized === 'omni' && !videoModes(model).some(item => item.id === 'omni') && !videoCount && imageCount <= 1) return imageCount ? 'first_frame' : 'text';
  return normalized;
}

export function videoResolutionLabel(model: string, resolution: string) {
  return /minimax-h3/i.test(model) ? ({ '720P': '768P', '1080P': '2K' }[resolution] || resolution) : resolution;
}

export function videoRatioLocked(model: string, mode: string) {
  return isSeedance25(model) && ['first_frame', 'first_last_frame', 'edit', 'extend'].includes(mode);
}

export function videoDurationOptions(model: string, resolution: string, mode = 'text') {
  const canonical = canonicalModelId(model).toLowerCase();
  if (/^veo-?3\.1/.test(canonical) && (resolution !== '720P' || mode === 'omni' || mode === 'first_last_frame')) return [8];
  const durations = getVideoModelById(model)?.supportedDurations || [5];
  if (/grok/i.test(model) && mode === 'extend') return durations.filter(value => value >= 2 && value <= 10);
  return /^vidu/.test(model) && mode === 'omni' ? durations.filter(value => value >= 3) : durations;
}

export function videoInputError(input: {
  model: string; refMode?: string; images?: string[]; videos?: string[];
  duration?: number; resolution?: string; aspectRatio?: string;
}): string | null {
  const { model, images = [], videos = [], refMode = 'omni' } = input;
  const config = getVideoModelById(model);
  const mode = resolveVideoMode(model, refMode, images.length, videos.length);
  if (!videoModes(model).some(item => item.id === mode)) return '当前模型尚未接入这种生成方式，请切换模式';
  if (mode === 'text' && (images.length || videos.length)) return '文生视频不使用参考素材，请移除素材或切换生成方式';
  if (mode === 'first_frame' && (images.length !== 1 || videos.length)) return '首帧模式需要一张图片';
  if (mode === 'first_last_frame' && (images.length !== 2 || videos.length)) return '首尾帧模式需要两张图片，分别作为首帧和尾帧';
  if ((mode === 'edit' || mode === 'extend') && !videos.length) return '请添加需要编辑或延长的参考视频';
  const grokClip = /grok/i.test(model) && (mode === 'edit' || mode === 'extend');
  if (videos.length && !referenceVideoAllowed(model) && !grokClip) return '当前模型的参考视频尚未接入，请使用图片或文字';
  if (/^viduq3(?:-mix)?$/.test(model) && !images.length) return '该模型需要参考图片，请添加素材';
  if (/^vidu/.test(model) && images.length > 15) return 'Vidu 最多支持 15 张参考图片';
  const canonical = canonicalModelId(model).toLowerCase();
  if (/omni[_-]flash|gemini-omni/.test(canonical) && (images.length > 7 || videos.length > 3)) return 'Omni Flash 最多支持 7 张参考图片、3 个参考视频';
  if (/^veo-?3\.1/.test(canonical) && mode === 'omni' && images.length > 3) return 'Veo 最多支持 3 张参考图片';
  if (/^wan3/.test(model) && (images.length > 10 || videos.length > 5)) return '万相最多支持 10 张参考图、5 个参考视频';
  if (/minimax-h3/i.test(model) && (images.length > 9 || videos.length > 3 || images.length + videos.length > 12)) return 'H3 最多支持 9 张参考图、3 个参考视频，合计不超过 12 个素材';
  if (/grok-imagine-video/i.test(model) && mode === 'omni' && images.length > 14) return 'Grok 最多支持 14 张参考图片';
  if (grokClip && (videos.length !== 1 || images.length)) return '请添加一段需要编辑或延长的视频';
  if (/kling.*omni/.test(model) && images.length > 7) return '可灵 Omni 最多支持 7 张参考图片';
  if (isSeedance(model)) {
    const maxImages = isSeedance25(model) ? 30 : 9;
    const maxVideos = isSeedance25(model) ? 10 : 3;
    if (images.length > maxImages || videos.length > maxVideos) return `当前模型最多支持 ${maxImages} 张参考图、${maxVideos} 个参考视频`;
  }
  if (input.resolution && config && !config.supportedResolutions.some(value => value === input.resolution!.toUpperCase())) return '当前模型不支持所选清晰度，请重新选择';
  if (input.aspectRatio && config && !config.supportedAspectRatios.includes(input.aspectRatio)) return '当前模型不支持所选比例，请重新选择';
  if (input.duration !== undefined && mode !== 'edit' && !(input.duration === -1 && (isSeedance(model) || /^wan3/.test(model)))
    && !videoDurationOptions(model, input.resolution?.toUpperCase() || '720P', mode).includes(input.duration)) return '当前模型、清晰度与生成方式不支持所选时长，请重新选择';
  return null;
}

function referenceVideoAllowed(model: string) {
  return isSeedance(model) || /^wan3/.test(model) || /minimax-h3/i.test(model) || /omni[_-]flash|gemini-omni/i.test(model);
}
