import { getVideoDurationBounds, getVideoModelById, resolveVideoResolution, VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS, type VideoResolution } from '@shared/domain/media/video';
import { videoModeLabel, videoModes } from '@shared/domain/media/videoCapabilities';

export type SalesAspectRatio = '9:16' | '3:4' | '16:9' | '1:1';
export type SalesVideoRefMode = 'omni' | 'first_frame' | 'first_last_frame' | 'text';
export type SalesRenderPhase = 'generating' | 'querying';

export const SALES_ASPECTS: { value: SalesAspectRatio; label: string }[] = [
  { value: '9:16', label: '9:16 竖屏' },
  { value: '3:4', label: '3:4' },
  { value: '16:9', label: '16:9 横屏' },
  { value: '1:1', label: '1:1' },
];

const SALES_REF_MODES: SalesVideoRefMode[] = ['omni', 'first_frame', 'first_last_frame', 'text'];

export interface SalesAspectChoice {
  value: SalesAspectRatio;
  label: string;
  disabled: boolean;
}

export interface SalesVideoCapability {
  known: boolean;
  note: string;
}

export function salesAspectChoices(modelId?: string): SalesAspectChoice[] {
  const model = modelId?.trim() ? getVideoModelById(modelId) : undefined;
  return SALES_ASPECTS.map((item) => ({
    value: item.value,
    label: item.label,
    disabled: Boolean(model && !model.supportedAspectRatios.includes(item.value)),
  }));
}

export function salesAspectConflict(modelId: string | undefined, aspect: string): string | null {
  if (!modelId?.trim() || !getVideoModelById(modelId)) return null;
  const ratios = getVideoModelById(modelId)?.supportedAspectRatios;
  if (!ratios?.length || ratios.includes(aspect)) return null;
  return `当前视频模型不支持 ${aspect}，请更换画幅或模型`;
}

export function salesVideoCapability(modelId?: string): SalesVideoCapability {
  const id = modelId?.trim() || '';
  if (!id) return { known: false, note: '请先配置视频模型' };
  const model = getVideoModelById(id);
  if (!model) return { known: false, note: '该模型的画幅和整段时长尚未登记，生成时以服务商实际结果为准' };
  const bounds = getVideoDurationBounds(id);
  const ratios = SALES_ASPECTS.filter((item) => model.supportedAspectRatios.includes(item.value)).map((item) => item.value);
  const ratioText = ratios.length > 0 ? `支持 ${ratios.join('、')}` : '当前画幅都不在支持列表里';
  return { known: true, note: `整段 ${bounds.min}–${bounds.max} 秒，${ratioText}` };
}

export function salesAspectOptions(modelId?: string): { id: string; label: string; disabled: boolean }[] {
  const model = modelId?.trim() ? getVideoModelById(modelId) : undefined;
  const aspects = new Set<string>(SALES_ASPECTS.map((item) => item.value));
  return VIDEO_ASPECT_RATIOS.map((item) => ({
    id: item.id,
    label: item.id === 'adaptive' ? '智能' : item.label,
    disabled: !aspects.has(item.id) || Boolean(model && !model.supportedAspectRatios.includes(item.id)),
  }));
}

export function salesRefModeChoices(modelId?: string): { id: SalesVideoRefMode; label: string }[] {
  const allowed = new Set(videoModes(modelId || '').map((item) => item.id));
  const choices = modelId?.trim() ? SALES_REF_MODES.filter((id) => allowed.has(id)) : SALES_REF_MODES;
  return choices.map((id) => ({ id, label: videoModeLabel(id) }));
}

export function salesResolveRefMode(modelId: string | undefined, mode: string | undefined): SalesVideoRefMode {
  const choices = salesRefModeChoices(modelId);
  if (choices.some((item) => item.id === mode)) return mode as SalesVideoRefMode;
  if (choices.some((item) => item.id === 'omni')) return 'omni';
  return choices[0]?.id || 'omni';
}

export function salesResolveResolution(modelId: string | undefined, current: string | undefined): VideoResolution {
  const supported = modelId?.trim() ? getVideoModelById(modelId)?.supportedResolutions : undefined;
  return resolveVideoResolution(current, supported);
}

export function salesDurationEnabled(modelId: string | undefined, duration: number): boolean {
  const allowed = modelId?.trim() ? getVideoModelById(modelId)?.supportedDurations : undefined;
  if (!allowed?.length) return true;
  return allowed.includes(duration);
}

export function salesParamSummary(input: { refMode: string; aspect: string; resolution: string; duration: number }): string {
  return `${videoModeLabel(input.refMode)} · ${input.aspect} · ${input.resolution} · ${input.duration}秒`;
}


export function salesResolutionChoices(modelId?: string): VideoResolution[] {
  const supported = modelId?.trim() ? getVideoModelById(modelId)?.supportedResolutions : undefined;
  if (!supported?.length) return [...VIDEO_RESOLUTIONS];
  const allowed = new Set(supported.map((value) => value.toUpperCase()));
  return VIDEO_RESOLUTIONS.filter((value) => allowed.has(value));
}

export function salesOpeningProductUrl(draft: {
  productUrl?: unknown;
  productName?: unknown;
  imageCatalog?: unknown;
  productImages?: unknown;
  scripts?: unknown;
}): string {
  const url = typeof draft.productUrl === 'string' ? draft.productUrl.trim() : '';
  if (!url) return '';
  const named = typeof draft.productName === 'string' && draft.productName.trim().length > 0;
  const catalog = Array.isArray(draft.imageCatalog) && draft.imageCatalog.length > 0;
  const images = Array.isArray(draft.productImages) && draft.productImages.length > 0;
  const scripted = Array.isArray(draft.scripts) && draft.scripts.length > 0;
  return named || catalog || images || scripted ? url : '';
}

export function salesPreviewClass(aspect: string, kind: 'hero' | 'shot'): string {
  if (kind === 'shot') {
    if (aspect === '16:9') return 'aspect-video w-full bg-black object-contain';
    if (aspect === '3:4') return 'mx-auto aspect-[3/4] max-h-72 w-full bg-black object-contain';
    if (aspect === '1:1') return 'mx-auto aspect-square max-h-72 w-full bg-black object-contain';
    return 'mx-auto aspect-[9/16] max-h-72 w-full bg-black object-contain';
  }
  if (aspect === '16:9') return 'aspect-video w-full bg-black object-contain';
  if (aspect === '3:4') return 'mx-auto aspect-[3/4] w-full max-w-sm bg-black object-contain';
  if (aspect === '1:1') return 'mx-auto aspect-square w-full max-w-sm bg-black object-contain';
  return 'mx-auto aspect-[9/16] w-full max-w-sm bg-black object-contain';
}

export function salesRenderStatus(input: {
  renderPhase: SalesRenderPhase | null;
  done: number;
  total: number;
  hasResult: boolean;
  single?: boolean;
}): string {
  if (input.single) {
    if (input.renderPhase === 'generating') return '正在生成成片';
    if (input.hasResult) return '成片已生成';
    return '等待生成成片';
  }
  if (input.renderPhase === 'generating') return `正在生成镜头 ${input.done}/${input.total}`;
  if (input.renderPhase === 'querying') return '正在查询历史镜头';
  if (input.hasResult) return '成片已生成';
  return `镜头 ${input.done}/${input.total}`;
}

export function salesShotStatusLabel(status?: string, hasAsset = false): string {
  if (status === 'generating') return '生成中';
  if (status === 'uncertain') return '提交未确认';
  if (status === 'failed') return '失败';
  if (hasAsset || status === 'done') return '已完成';
  return '等待';
}

export function salesJobAllowed(
  busy: { collecting: boolean; planning: boolean; rendering: boolean; uploading?: boolean },
  job: 'collect' | 'plan' | 'render',
): boolean {
  if (busy.collecting || busy.uploading || busy.planning || busy.rendering) return false;
  return job === 'collect' || job === 'plan' || job === 'render';
}
