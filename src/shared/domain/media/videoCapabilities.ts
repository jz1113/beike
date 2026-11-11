import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { getVideoModelById, resolveVideoResolution } from './video';
import { isMetasoH3, isMiniMaxOfficialBase, officialVideoProvider, isComflyVideoBase, isFalVideoBase, isFalOmniVideoModel } from './videoChannels';
import { isVeoNativeBase, veoNativeModelUrl, veoExtensionHint } from './veoChannels';

/** Public video API presets; custom audio files require separate xAI partner access. */
export const GROK_VIDEO_VOICES = [
  { id: 'eve', name: 'Eve', description: '活泼明快' },
  { id: 'ara', name: 'Ara', description: '温暖友好' },
  { id: 'leo', name: 'Leo', description: '沉稳有力' },
  { id: 'rex', name: 'Rex', description: '自信清晰' },
  { id: 'sal', name: 'Sal', description: '平顺自然' },
] as const;

function grokPresetVoicesAllowed(model: string) {
  return /^grok-imagine-video-1[.-]5(?:-preview)?$/i.test(canonicalModelId(model));
}

export function selectedGrokVideoVoice(id?: string) {
  return GROK_VIDEO_VOICES.find((voice) => voice.id === id?.trim().toLowerCase());
}

export const VIDEO_GENERATION_MODES = [
  { id: 'omni', name: '全能参考', desc: '参考图片或视频的主体、场景或动作' },
  { id: 'first_frame', name: '首帧生视频', desc: '以一张图片作为视频的第一帧' },
  { id: 'last_frame', name: '尾帧生视频', desc: '以一张图片指定视频的结束画面' },
  { id: 'first_last_frame', name: '首尾帧', desc: '两张图片分别指定起点与终点' },
  { id: 'text', name: '文生视频', desc: '用文字描述主体、动作与镜头' },
  { id: 'edit', name: '视频编辑', desc: '描述原视频中需要修改的内容' },
  { id: 'extend', name: '视频延长', desc: '描述原视频之后发生的内容' },
  { id: 'motion_control', name: '动作控制', desc: '用一张人物图片复现一段视频中的动作，时长跟随参考视频' },
];

export const isSeedance25 = (id: string) => /seedance-2[.-]5/i.test(id);
export const isSeedance = (id: string) => /seedance/i.test(id);
export const isKling4 = (id: string) => /^kling-4\.0(?:-flash)?$/i.test(id);

/** Reference audio input is distinct from a model's generated-audio switch. */
export function referenceAudioAllowed(model: string) {
  const id = canonicalModelId(model).toLowerCase();
  return /seedance-2[.-](?:0|5)(?:\D|$)/.test(id) || /^wan3\.0-video(?:-prime)?$/.test(id) || id === 'viduq4-preview' || id === 'minimax-h3';
}

const FAL_OMNI_VIDEO_MODEL = 'gemini-omni-1.2-flash';

const FULL_MODES = ['omni', 'first_frame', 'first_last_frame', 'text'];
const FRAME_MODES = ['first_frame', 'first_last_frame', 'text'];
const SEEDANCE_MODES = ['omni', 'first_frame', 'first_last_frame', 'text', 'edit', 'extend'];

/** Expose modes with an implemented payload path, not every vendor marketing feature. */
export function videoModeIds(model: string, baseUrl?: string) {
  const id = canonicalModelId(model).toLowerCase();
  if (/seedance/.test(id)) return SEEDANCE_MODES;
  if (id === 'viduq3' || id === 'viduq3-mix') return ['omni'];
  if (id === 'viduq3-pro') return FRAME_MODES;
  if (id === 'viduq3-turbo') return FULL_MODES;
  if (id === 'viduq4-preview') return ['omni', 'first_frame'];
  if (id === 'gemini-omni-1.0-flash') return ['omni', 'first_frame', 'text', 'edit'];
  if (id === 'omni_flash-10s' || id === FAL_OMNI_VIDEO_MODEL) return SEEDANCE_MODES;
  if (id === 'veo3.1-pro') return FRAME_MODES;
  if (/^veo3\.1/.test(id)) return [...FULL_MODES, 'extend'];
  if (/sora/.test(id)) return ['first_frame', 'text'];
  if (/grok/.test(id)) return (officialVideoProvider(baseUrl) === 'grok' || isComflyVideoBase(baseUrl)) && grokPresetVoicesAllowed(model) ? FULL_MODES : [...FULL_MODES, 'edit', 'extend'];
  if (id === 'kling-4.0-flash') return ['omni', 'first_frame', 'text', 'edit'];
  if (id === 'kling-4.0') return [...FULL_MODES, 'edit'];
  if (/kling/.test(id)) return id.includes('omni') ? [...FULL_MODES, 'edit', 'extend'] : (officialVideoProvider(baseUrl) === 'kling' || isComflyVideoBase(baseUrl)) && /^kling-video-(?:v3|v2-6)$/.test(id) ? [...FRAME_MODES, 'motion_control'] : FRAME_MODES;
  if (/wan/.test(id)) return FULL_MODES;
  if (/minimax|hailuo/.test(id) || id === 'h3') return id === 'minimax-h3' && (isMetasoH3(model, baseUrl) || isMiniMaxOfficialBase(baseUrl)) ? ['omni', 'first_frame', 'last_frame', 'first_last_frame', 'text'] : FULL_MODES;
  return ['first_frame', 'text'];
}

export function videoModes(model: string, baseUrl?: string) {
  const id = canonicalModelId(model).toLowerCase();
  return VIDEO_GENERATION_MODES.filter(mode => videoModeIds(model, baseUrl).includes(mode.id)).map(mode => {
    if (mode.id === 'extend' && /^veo3\.1/.test(id)) return { ...mode, name: isVeoNativeBase(baseUrl) ? '视频延长' : '末帧续拍延长', desc: veoExtensionHint(model, 'extend', baseUrl) || mode.desc };
    if (mode.id !== 'omni') return mode;
    if (id === 'minimax-h3') return { ...mode, desc: '可混合参考图片、视频与音频，一张参考图也不会被当成首帧' };
    if (/minimax|hailuo/.test(id)) return { ...mode, desc: '可混合参考图片与视频，一张参考图也不会被当成首帧' };
    if (isSeedance(id)) return { ...mode, desc: '全模态参考图片或视频；一张参考图也不会被当成首帧' };
    if (id === 'gemini-omni-1.0-flash') return { ...mode, desc: '最多 10 张参考图' };
    if (id === FAL_OMNI_VIDEO_MODEL) return { ...mode, desc: '最多 10 张参考图、3 段参考视频' };
    if (/omni[_-]flash|gemini-omni/.test(id)) return { ...mode, desc: '图片和视频合计最多 7 项' };
    if (/^veo3\.1/.test(id)) return { ...mode, desc: '最多 3 张参考图，不能与首尾帧同时使用' };
    if (/grok/.test(id)) return { ...mode, desc: '最多 14 张参考图，不锁定为首帧' };
    if (isKling4(id)) return { ...mode, desc: '最多 10 张参考图、5 段参考视频，合计最多 15 项' };
    if (/kling.*omni/.test(id)) return { ...mode, desc: '最多 7 张参考图；搭配 1 段视频时最多 4 张图' };
    return mode;
  });
}

export function videoModeLabel(mode?: string) {
  return VIDEO_GENERATION_MODES.find(item => item.id === mode)?.name || '全能参考';
}

export function resolveVideoMode(model: string, mode: string | undefined = undefined, imageCount = 0, videoCount = 0, baseUrl?: string) {
  if (!mode) {
    const preferred = videoCount && /^veo3\.1/i.test(canonicalModelId(model)) ? 'extend' : videoCount || imageCount > 2 ? 'omni' : imageCount === 2 ? 'first_last_frame' : imageCount === 1 ? 'first_frame' : 'text';
    return videoModes(model, baseUrl).some(item => item.id === preferred) ? preferred : videoModes(model, baseUrl)[0].id;
  }
  const normalized = ['multi_frame', 'reference_image'].includes(mode) ? 'omni' : mode;
  // Old sessions used omni for every model, including models with only text / first-frame inputs.
  if (normalized === 'omni' && !videoModeIds(model, baseUrl).includes('omni') && !videoCount && imageCount <= 1) return imageCount ? 'first_frame' : 'text';
  return normalized;
}

export function videoResolutionLabel(model: string, resolution: string, baseUrl?: string) {
  return canonicalModelId(model).toLowerCase() === 'minimax-h3' && !isMetasoH3(model, baseUrl)
    ? ({ '720P': '768P', '1080P': '2K' }[resolution] || resolution) : resolution;
}

export function videoRatioLocked(model: string, mode: string, baseUrl?: string) {
  return isFalOmniVideoModel(canonicalModelId(model)) && ['edit', 'extend'].includes(mode)
    || isKling4(model) && ['first_frame', 'first_last_frame'].includes(mode)
    || isSeedance25(model) && ['first_frame', 'first_last_frame', 'edit', 'extend'].includes(mode)
    || canonicalModelId(model).toLowerCase() === 'minimax-h3' && (isMiniMaxOfficialBase(baseUrl) || isMetasoH3(model, baseUrl) || isComflyVideoBase(baseUrl)) && ['first_frame', 'last_frame', 'first_last_frame'].includes(mode);
}

export function videoRatioOptions(model: string, mode: string, baseUrl?: string): string[] {
  if (videoRatioLocked(model, mode, baseUrl)) return ['adaptive'];
  const ratios = getVideoModelById(model, baseUrl)?.supportedAspectRatios || [];
  return isKling4(model) && mode === 'text' ? ratios.filter(ratio => ratio !== 'adaptive') : ratios;
}

export function videoDurationOptions(model: string, resolution: string, mode = 'text', baseUrl?: string) {
  const canonical = canonicalModelId(model).toLowerCase();
  if (canonical === FAL_OMNI_VIDEO_MODEL && mode === 'extend') return Array.from({ length: 8 }, (_, index) => index + 3);
  if (/^veo-?3\.1/.test(canonical) && mode==='extend') return [isVeoNativeBase(baseUrl)?7:8];
  if (isMetasoH3(model, baseUrl)) return Array.from({ length: 12 }, (_, index) => index + 4);
  if (/^veo-?3\.1/.test(canonical) && (resolution !== '720P' || mode === 'omni' || mode === 'first_last_frame')) return [8];
  const durations = getVideoModelById(model, baseUrl)?.supportedDurations || [5];
  if (/grok/i.test(model) && mode === 'extend') return durations.filter(value => value >= 2 && value <= 10);
  return /^vidu/.test(model) && mode === 'omni' ? durations.filter(value => value >= 3) : durations;
}

export function videoDurationFollowsSource(model: string, mode: string): boolean {
  const canonical = canonicalModelId(model).toLowerCase();
  return mode === 'motion_control' || (
    mode === 'edit' && !isKling4(model) && (isFalOmniVideoModel(canonical) || !/omni[_-]flash|gemini-omni/.test(canonical))
  );
}

export function videoResolutionOptions(model: string, mode: string, baseUrl?: string, hasVoiceReferences = false) {
  const resolutions = getVideoModelById(model, baseUrl)?.supportedResolutions;
  if (/^veo-?3\.1.*fast/i.test(canonicalModelId(model)) && isVeoNativeBase(baseUrl)) return resolutions?.filter(resolution=>resolution!=='4K');
  if (mode === 'motion_control') return resolutions?.filter(resolution => resolution === '720P' || resolution === '1080P');
  return /grok/i.test(model) && (['omni', 'first_last_frame'].includes(mode) || hasVoiceReferences)
    ? resolutions?.filter((resolution) => resolution === '480P' || resolution === '720P') : resolutions;
}

/** Resolve the controls in dependency order: mode, resolution, then duration. */
export function resolveVideoParameters(
  model: string,
  input: { mode?: string; aspect?: string; resolution?: string; duration?: number },
  baseUrl?: string,
  references: { images?: number; videos?: number; voices?: boolean } = {},
) {
  const { images = 0, videos = 0, voices = false } = references;
  const preferred = resolveVideoMode(model, input.mode, images, videos, baseUrl);
  const mode = videoModeIds(model, baseUrl).includes(preferred)
    ? preferred
    : resolveVideoMode(model, undefined, images, videos, baseUrl);
  const ratios = videoRatioOptions(model, mode, baseUrl);
  const requestedAspect = ['smart', 'auto'].includes(input.aspect || '') ? 'adaptive' : input.aspect;
  const aspect = requestedAspect && (!ratios.length || ratios.includes(requestedAspect))
    ? requestedAspect
    : ratios.includes('16:9') ? '16:9' : ratios[0] ?? '16:9';
  const requestedResolution = canonicalModelId(model).toLowerCase() === 'minimax-h3' && !isMetasoH3(model, baseUrl)
    ? ({ '768P': '720P', '2K': '1080P' }[input.resolution?.toUpperCase() || ''] ?? input.resolution)
    : input.resolution;
  const resolution = resolveVideoResolution(requestedResolution, videoResolutionOptions(model, mode, baseUrl, voices));
  const durations = videoDurationOptions(model, resolution, mode, baseUrl);
  const requestedDuration = input.duration ?? (isFalOmniVideoModel(canonicalModelId(model)) ? 8 : 5);
  const duration = durations.reduce((best, value) => (
    Math.abs(value - requestedDuration) < Math.abs(best - requestedDuration) ? value : best
  ), durations[0] ?? 5);
  return { mode, aspect, resolution, duration };
}

export function videoInputError(input: {
  model: string; refMode?: string; images?: string[]; videos?: string[]; audios?: string[]; audio?: boolean;
  duration?: number; resolution?: string; aspectRatio?: string; baseUrl?: string; voiceIds?: readonly string[];
}): string | null {
  const { model, images = [], videos = [], audios = [], refMode = 'omni' } = input;
  const config = getVideoModelById(model, input.baseUrl);
  const mode = resolveVideoMode(model, refMode, images.length, videos.length, input.baseUrl);
  if(/^veo-?3\.1/i.test(canonicalModelId(model))) {
    if(input.baseUrl && isVeoNativeBase(input.baseUrl)) {
      try {veoNativeModelUrl(input.baseUrl,model);} catch(error) {return error instanceof Error?error.message:'Veo 官方地址不正确';}
    }
    if(isVeoNativeBase(input.baseUrl) && canonicalModelId(model).toLowerCase().includes('fast') && input.resolution==='4K')return 'Veo Fast 官方渠道最高支持 1080P';
    if(mode==='extend' && (videos.length!==1 || images.length || audios.length))return 'Veo 延长需要且仅接受一段视频，不混用参考图片或音频';
  }
  if (/grok/i.test(model) && input.baseUrl) {
    let host = '';
    try { host = new URL(input.baseUrl).hostname.toLowerCase(); } catch { /* Gateway URL validation reports malformed addresses. */ }
    if (host === 'us.api.x.ai') return 'Grok 美国区域端点暂不提供视频接口，请使用官方全球地址 https://api.x.ai/v1';
    if ((host === 'api.x.ai' || host.endsWith('.api.x.ai') || isComflyVideoBase(input.baseUrl)) && grokPresetVoicesAllowed(model) && ['edit', 'extend'].includes(mode)) {
      return 'Grok 1.5 官方接口暂不支持编辑或延长，请切换生成方式；这两种方式需使用 grok-imagine-video';
    }
  }
  if (input.voiceIds?.length) {
    if (!grokPresetVoicesAllowed(model)) return '当前模型不支持 Grok 官方预置音色，请切换 Grok 1.5 或重新选择声音';
    if (['edit', 'extend'].includes(mode)) return 'Grok 视频编辑与延长不支持预置音色，请切换生成方式';
    if (audios.length) return 'Grok 预置音色不能与音频文件混用，请保留一种声音参考';
    if (input.voiceIds.length > 3 || input.voiceIds.some((id) => !id.trim() || id.length > 64)) return 'Grok 最多支持 3 个有效预置音色';
    if (input.audio === false) return 'Grok 预置音色需要开启生成声音';
  }
  if (audios.length) {
    if (/grok/i.test(model)) return 'Grok 官方普通接口仅支持预置音色，自有音频文件需 xAI 合作伙伴权限；请选择 Grok 预置音色，或改用画外旁白后期合成';
    if (!referenceAudioAllowed(model)) return '当前模型尚未接入参考音频，请切换支持音频参考的 Seedance 2.0 / 2.5、MiniMax-H3、万相 3.0 或 Vidu Q4';
    if (mode !== 'omni') return '参考音频仅支持全能参考模式，请切换生成方式';
    if (input.audio === false) return '参考音频需要开启生成声音，不能在无声视频中使用';
    if (isSeedance(model)) {
      const maxMaterials = isSeedance25(model) ? 50 : 12;
      if (images.length + videos.length + audios.length > maxMaterials) return `当前模型的图片、视频与音频合计最多 ${maxMaterials} 个素材`;
    }
    const maxAudios = isSeedance25(model) ? 10 : isSeedance(model) || ['viduq4-preview', 'minimax-h3'].includes(canonicalModelId(model).toLowerCase()) ? 3 : 5;
    if (audios.length > maxAudios) return `当前模型最多支持 ${maxAudios} 个参考音频`;
    if (isSeedance(model) && !isSeedance25(model) && !images.length && !videos.length) return 'Seedance 2.0 参考音频需要至少搭配一张图片或一段视频';
  }
  if (!videoModes(model, input.baseUrl).some(item => item.id === mode)) return '当前模型尚未接入这种生成方式，请切换模式';
  if (mode === 'text' && (images.length || videos.length)) return '文生视频不使用参考素材，请移除素材或切换生成方式';
  if (mode === 'first_frame' && (images.length !== 1 || videos.length)) return '首帧模式需要一张图片';
  if (mode === 'last_frame' && (images.length !== 1 || videos.length)) return '尾帧模式需要一张图片作为结束画面';
  if (mode === 'first_last_frame' && (images.length !== 2 || videos.length)) return '首尾帧模式需要两张图片，分别作为首帧和尾帧';
  if ((mode === 'edit' || mode === 'extend') && !videos.length) return '请添加需要编辑或延长的参考视频';
  const grokClip = /grok/i.test(model) && (mode === 'edit' || mode === 'extend');
  if (mode === 'motion_control' && (images.length !== 1 || videos.length !== 1)) return '动作控制需要一张人物图片和一段动作参考视频';
  if (videos.length && !referenceVideoAllowed(model) && !grokClip && mode !== 'motion_control' && !(/^veo-?3\.1/i.test(model) && mode==='extend')) return '当前模型的参考视频尚未接入，请使用图片或文字';
  const canonical = canonicalModelId(model).toLowerCase();
  if ((/^viduq3(?:-mix)?$/.test(canonical) || canonical === 'viduq4-preview' || mode === 'omni') && /^vidu/.test(canonical) && !images.length) return '该模型需要参考图片，请添加素材';
  if (/^vidu/.test(canonical)) {
    const maxViduImages = canonical === 'viduq4-preview' ? 15 : 7;
    if (images.length > maxViduImages) return `Vidu 最多支持 ${maxViduImages} 张参考图片`;
  }
  if (isFalOmniVideoModel(canonical)) {
    if (!isFalVideoBase(input.baseUrl)) return 'Gemini Omni Flash 需要绑定 fal 队列渠道';
    if (canonical === 'gemini-omni-1.0-flash' && mode === 'omni' && videos.length) return 'Omni Flash 1.0 的全能参考只支持图片';
    if (mode === 'omni' && !images.length && !videos.length) return '全能参考需要至少一项素材，纯文字请切换文生视频';
    if (images.length > 10 || videos.length > 3) return 'Gemini Omni Flash 1.2 最多支持 10 张参考图和 3 段参考视频';
    if (['edit', 'extend'].includes(mode) && (videos.length !== 1 || images.length)) return '编辑和延长需要一段视频，不混用参考图';
    if (input.audio === false) return 'Gemini Omni Flash 使用原生音频，不提供静音开关';
  } else if (/omni[_-]flash|gemini-omni/.test(canonical) && images.length + videos.length > 7) return 'Omni Flash 最多支持 7 项参考素材（图片与视频合计）';
  if (/^veo-?3\.1/.test(canonical) && mode === 'omni' && images.length > 3) return 'Veo 最多支持 3 张参考图片';
  if (/^wan3/.test(model) && (images.length > 10 || videos.length > 5)) return '万相最多支持 10 张参考图、5 个参考视频';
  if (canonical === 'minimax-h3' && (images.length > 9 || videos.length > 3 || images.length + videos.length > 12)) return 'H3 最多支持 9 张参考图、3 个参考视频，合计不超过 12 个素材';
  if (/grok-imagine-video/i.test(model) && mode === 'omni' && images.length > 14) return 'Grok 最多支持 14 张参考图片';
  if (grokClip && (videos.length !== 1 || images.length)) return '请添加一段需要编辑或延长的视频';
  if (isKling4(model)) {
    if (officialVideoProvider(input.baseUrl) !== 'kling') return '可灵 4.0 系列需要绑定可灵官方 API 渠道';
    if (images.length > 10 || videos.length > 5 || images.length + videos.length > 15) return '可灵 4.0 系列最多支持 10 张图片、5 段视频，合计最多 15 项';
  } else if (/kling.*omni/i.test(model)) {
    if (videos.length > 1) return '可灵 Omni 最多支持 1 个参考视频';
    if (images.length > (videos.length ? 4 : 7)) return `可灵 Omni ${videos.length ? '搭配视频时' : ''}最多支持 ${videos.length ? 4 : 7} 张参考图片`;
  }
  if (isSeedance(model)) {
    const maxImages = isSeedance25(model) ? 30 : 9;
    const maxVideos = isSeedance25(model) ? 10 : 3;
    if (images.length > maxImages || videos.length > maxVideos) return `当前模型最多支持 ${maxImages} 张参考图、${maxVideos} 个参考视频`;
  }
  const resolution = canonical === 'minimax-h3'
    ? isMetasoH3(model, input.baseUrl)
      ? input.resolution?.toUpperCase() === '720P' ? '768P' : input.resolution
      : ({ '768P': '720P', '2K': '1080P' }[input.resolution?.toUpperCase() || ''] || input.resolution)
    : input.resolution;
  if (/grok/i.test(model) && (['omni', 'first_last_frame'].includes(mode) || input.voiceIds?.length) && resolution?.toUpperCase() === '1080P') return 'Grok 参考生成与首尾帧最高支持 720P，请调整清晰度';
  if (resolution && config && !config.supportedResolutions.some(value => value === resolution.toUpperCase())) return '当前模型不支持所选清晰度，请重新选择';
  if (input.aspectRatio && config) {
    const ratios = isKling4(model) ? videoRatioOptions(model, mode, input.baseUrl) : config.supportedAspectRatios;
    if (!ratios.includes(input.aspectRatio) && !(input.aspectRatio === 'adaptive' && videoRatioLocked(model, mode, input.baseUrl))) return '当前模型不支持所选比例，请重新选择';
  }
  if (mode === 'motion_control' && input.resolution?.toUpperCase() === '4K') return '动作控制最高支持 1080P，请调整清晰度';
  if (input.duration !== undefined && !videoDurationFollowsSource(model, mode) && !(input.duration === -1 && (isSeedance(model) || /^wan3/.test(model)))
    && !videoDurationOptions(model, input.resolution?.toUpperCase() || '720P', mode, input.baseUrl).includes(input.duration)) return '当前模型、清晰度与生成方式不支持所选时长，请重新选择';
  return null;
}

function referenceVideoAllowed(model: string) {
  const id = canonicalModelId(model).toLowerCase();
  return isKling4(id) || isSeedance(id) || /^wan3/.test(id) || id === 'minimax-h3' || /kling.*omni|omni[_-]flash|gemini-omni/i.test(id);
}
