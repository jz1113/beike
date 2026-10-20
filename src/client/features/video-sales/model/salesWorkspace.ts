import { getVideoDurationBounds, getVideoModelById, resolveVideoResolution, VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS, type VideoResolution } from '@shared/domain/media/video';
import { videoModeLabel, videoModes } from '@shared/domain/media/videoCapabilities';
import { salesAspectError } from './salesTiming';

export type SalesAspectRatio = '9:16' | '3:4' | '16:9' | '1:1';
export type SalesVideoRefMode = 'omni' | 'first_frame';
export type SalesWorkPane = 'plan' | 'result';
export type SalesMobilePane = 'config' | 'workspace';
export type SalesFlowStep = 'prepare' | 'confirm' | 'render';
export type SalesPlanPhase = 'analyze' | 'script' | 'select' | 'prompt';
export type SalesRenderPhase = 'redrawing' | 'generating' | 'composing';

export const SALES_ASPECTS: { value: SalesAspectRatio; label: string }[] = [
  { value: '9:16', label: '9:16 竖屏' },
  { value: '3:4', label: '3:4' },
  { value: '16:9', label: '16:9 横屏' },
  { value: '1:1', label: '1:1' },
];

const SALES_REF_MODES: SalesVideoRefMode[] = ['omni', 'first_frame'];

const PLAN_PHASE_LABEL: Record<SalesPlanPhase, string> = {
  analyze: '正在分析商品图片…',
  script: '正在整理分镜和口播…',
  select: '正在挑选参考图…',
  prompt: '正在更新视频提示词…',
};

const RENDER_PHASE_LABEL: Record<SalesRenderPhase, string> = {
  redrawing: '正在重绘参考图…',
  generating: '正在生成镜头…',
  composing: '正在合成成片…',
};

export interface SalesAspectChoice {
  value: SalesAspectRatio;
  label: string;
  disabled: boolean;
}

export interface SalesVideoCapability {
  known: boolean;
  note: string;
}

export interface SalesFlowStepView {
  id: SalesFlowStep;
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

export interface SalesActionButton {
  label: string;
  disabled: boolean;
  reason: string | null;
}

export interface SalesActionState {
  primary: 'plan' | 'render';
  plan: SalesActionButton;
  render: SalesActionButton;
}

export interface SalesActionInput {
  hasName: boolean;
  hasUrl: boolean;
  usableImages: number;
  hasScript: boolean;
  isCollecting: boolean;
  isUploading?: boolean;
  isPlanning: boolean;
  isRendering: boolean;
  planPhase: SalesPlanPhase | null;
  renderPhase: SalesRenderPhase | null;
  chatReady: boolean;
  videoReady: boolean;
  aspectConflict: string | null;
  redrawScenes?: boolean;
  needsSceneFrames?: boolean;
  imageReady?: boolean;
  needsFashionPerson?: boolean;
  fashionPromptMissing?: boolean;
  singleDelivery?: boolean;
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
  return salesAspectError(modelId, aspect);
}

export function salesVideoCapability(modelId?: string): SalesVideoCapability {
  const id = modelId?.trim() || '';
  if (!id) return { known: false, note: '请先配置视频模型' };
  const model = getVideoModelById(id);
  if (!model) return { known: false, note: '该模型的画幅和单镜头时长尚未登记，生成时以服务商实际结果为准' };
  const bounds = getVideoDurationBounds(id);
  const ratios = SALES_ASPECTS.filter((item) => model.supportedAspectRatios.includes(item.value)).map((item) => item.value);
  const ratioText = ratios.length > 0 ? `支持 ${ratios.join('、')}` : '当前画幅都不在支持列表里';
  return { known: true, note: `单镜头 ${bounds.min}–${bounds.max} 秒，${ratioText}` };
}

export function salesAspectOptions(modelId?: string): { id: string; label: string; disabled: boolean }[] {
  const model = modelId?.trim() ? getVideoModelById(modelId) : undefined;
  const compose = new Set<string>(SALES_ASPECTS.map((item) => item.value));
  return VIDEO_ASPECT_RATIOS.map((item) => ({
    id: item.id,
    label: item.id === 'adaptive' ? '智能' : item.label,
    disabled: !compose.has(item.id) || Boolean(model && !model.supportedAspectRatios.includes(item.id)),
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

export function salesParamSummary(input: { refMode: string; aspect: string; resolution: string; duration: number }): string {
  return `${videoModeLabel(input.refMode)} · ${input.aspect} · ${input.resolution} · ${input.duration}秒`;
}

export function salesComposeResolution(resolution: string | undefined): '720p' | '1080p' {
  const value = (resolution || '').toUpperCase();
  if (value === '480P' || value === '720P') return '720p';
  return '1080p';
}

export function salesComposeAspect(aspect: string): SalesAspectRatio {
  if (aspect === '16:9' || aspect === '3:4' || aspect === '1:1' || aspect === '9:16') return aspect;
  return '9:16';
}

export function salesResolutionChoices(modelId?: string): VideoResolution[] {
  const supported = modelId?.trim() ? getVideoModelById(modelId)?.supportedResolutions : undefined;
  if (!supported?.length) return [...VIDEO_RESOLUTIONS];
  const allowed = new Set(supported.map((value) => value.toUpperCase()));
  return VIDEO_RESOLUTIONS.filter((value) => allowed.has(value));
}

export function salesFlowSteps(input: {
  hasScript: boolean;
  isCollecting: boolean;
  isPlanning: boolean;
  isRendering: boolean;
  hasRenderActivity: boolean;
}): SalesFlowStepView[] {
  let current: SalesFlowStep = 'prepare';
  if (!input.isCollecting && !input.isPlanning && (input.isRendering || input.hasRenderActivity)) current = 'render';
  else if (!input.isCollecting && (input.hasScript || input.isPlanning)) current = 'confirm';
  const labels: Record<SalesFlowStep, string> = {
    prepare: '资料准备',
    confirm: input.isPlanning && !input.hasScript ? '正在整理方案' : '方案确认',
    render: input.isRendering ? '正在生成视频' : '视频生成',
  };
  const order: SalesFlowStep[] = ['prepare', 'confirm', 'render'];
  const index = order.indexOf(current);
  return order.map((id, stepIndex) => ({
    id,
    label: labels[id],
    state: stepIndex < index ? 'done' : stepIndex === index ? 'current' : 'upcoming',
  }));
}

export function initialSalesPane(hasRenderActivity: boolean): SalesWorkPane {
  return hasRenderActivity ? 'result' : 'plan';
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

export function salesHasRenderActivity(shots: { status?: string; assetUrl?: string }[] | undefined, resultUrl: string | null): boolean {
  if (resultUrl) return true;
  return Boolean(shots?.some((shot) => (shot.status && shot.status !== 'pending') || shot.assetUrl));
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

export function salesActions(input: SalesActionInput): SalesActionState {
  const busy = input.isCollecting || input.isUploading || input.isPlanning || input.isRendering;
  let planReason: string | null = null;
  if (!input.hasName && !input.hasUrl) planReason = '请先粘贴商品链接，或填写商品名称';
  else if (input.hasName && input.usableImages === 0) planReason = '请至少保留一张可用商品图';
  else if (input.needsFashionPerson) planReason = '请上传出镜人物';
  else if (!input.chatReady) planReason = '请先配置多模态模型';

  let renderReason: string | null = null;
  if (!input.hasScript) renderReason = '请先生成创作方案';
  else if (input.usableImages === 0) renderReason = '请至少保留一张可用商品图';
  else if (input.needsFashionPerson) renderReason = '请上传出镜人物';
  else if (input.fashionPromptMissing) renderReason = '请按服饰带货重新生成方案';
  else if (!input.videoReady) renderReason = '请先配置视频模型';
  else if (input.needsSceneFrames && !input.imageReady) renderReason = '请先配置绘图模型';
  else if (input.aspectConflict) renderReason = input.aspectConflict;

  const planLabel = input.isUploading
    ? '正在上传图片…'
    : input.isCollecting
      ? '正在采集商品…'
      : input.planPhase
        ? PLAN_PHASE_LABEL[input.planPhase]
        : input.hasScript
          ? '重新生成方案'
          : '生成创作方案';
  const renderLabel = input.renderPhase === 'generating' && input.singleDelivery
    ? '正在生成成片…'
    : input.renderPhase
      ? RENDER_PHASE_LABEL[input.renderPhase]
      : input.planPhase === 'prompt'
        ? PLAN_PHASE_LABEL.prompt
        : '确认方案，生成视频';

  return {
    primary: input.hasScript && !input.isPlanning && !input.isCollecting && !input.isUploading ? 'render' : 'plan',
    plan: { label: planLabel, disabled: busy || Boolean(planReason), reason: busy ? null : planReason },
    render: { label: renderLabel, disabled: busy || Boolean(renderReason), reason: busy ? null : renderReason },
  };
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
  if (input.renderPhase === 'redrawing') return `正在重绘参考图 ${input.done}/${input.total}`;
  if (input.renderPhase === 'generating') return `正在生成镜头 ${input.done}/${input.total}`;
  if (input.renderPhase === 'composing') return '正在合成成片';
  if (input.hasResult) return '成片已生成';
  return `镜头 ${input.done}/${input.total}`;
}

export function salesRedrawnCount(shots: Array<{ referenceFrameUrl?: string; status?: string; assetUrl?: string; taskId?: string }>): number {
  return shots.filter((shot) => (
    Boolean(shot.referenceFrameUrl)
    || shot.status === 'uncertain'
    || (shot.status === 'done' && Boolean(shot.assetUrl))
    || (Boolean(shot.taskId) && shot.status === 'generating' && !shot.assetUrl)
  )).length;
}

export function salesShotStatusLabel(status?: string, hasAsset = false): string {
  if (status === 'redrawing') return '重绘中';
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
