import type { VideoSalesScript } from '@shared/domain/sales';

export function salesHasQueryableTask(script?: VideoSalesScript): boolean {
  const open = ['generating', 'uncertain'].includes(script?.renderStatus || '');
  return Boolean(open && (script?.renderTaskId || script?.renderSubmissionKey)
    || script?.deliveryMode !== 'single' && script?.shots.some((shot) => shot.taskId && shot.status === 'generating'));
}

export function salesHasRenderActivity(script: VideoSalesScript | undefined, resultUrl: string | null, rendering: boolean): boolean {
  return Boolean(resultUrl || rendering || script?.renderTaskId || script?.renderError
    || script?.renderStatus && script.renderStatus !== 'pending'
    || script?.deliveryMode !== 'single' && script?.shots.some((shot) => shot.taskId || shot.assetUrl || shot.status && shot.status !== 'pending'));
}

export const SALES_WORKFLOW_STEPS = [
  ['product', '商品采集'], ['plan', '卖点与脚本'], ['assets', '素材补齐'], ['video', '视频生成'], ['result', '生成结果'],
] as const;
export type SalesWorkflowStep = (typeof SALES_WORKFLOW_STEPS)[number][0];
export interface SalesWorkflowStepView { id: SalesWorkflowStep; label: string; state: 'current' | 'done' | 'pending' }
export interface SalesNavigation { step: SalesWorkflowStep; lastCreativeStep: Exclude<SalesWorkflowStep, 'product'> }

export function initialSalesNavigation(hasScript: boolean, hasResult: boolean): SalesNavigation {
  const step = hasResult ? 'result' : hasScript ? 'plan' : 'product';
  return { step, lastCreativeStep: step === 'product' ? 'plan' : step };
}

export function restoreSalesNavigation(saved: SalesNavigation | undefined, hasScript: boolean, hasResult: boolean): SalesNavigation {
  const fallback = initialSalesNavigation(hasScript, hasResult);
  const valid = (step: unknown) => SALES_WORKFLOW_STEPS.some(([id]) => id === step);
  if (!saved || !valid(saved.step) || !valid(saved.lastCreativeStep) || saved.lastCreativeStep === ('product' as string) || !hasScript) return fallback;
  return saved;
}

export function navigateSalesWorkspace(previous: SalesNavigation, step: SalesWorkflowStep): SalesNavigation {
  return { step, lastCreativeStep: step === 'product' ? previous.lastCreativeStep : step };
}

export type SalesActionIntent = SalesWorkflowStep | 'write' | 'prepare' | 'queryAssets' | 'confirmAssets' | 'finalize' | 'render' | 'query' | 'stop' | 'download' | 'resume';
interface ViewAction { label: string; intent: SalesActionIntent; disabled?: boolean }
export interface SalesStageActions { primary: ViewAction; secondary?: ViewAction; reason?: string | null; note?: string }
export interface SalesStageContext {
  step: SalesWorkflowStep;
  busy: boolean;
  progress?: string | null;
  hasScript: boolean;
  collected?: boolean;
  planCurrent: boolean;
  planReason: string | null;
  assetsReady: boolean;
  assetsGenerated?: boolean;
  assetsQueryable?: boolean;
  assetsUnresolved?: boolean;
  preflightError?: string | null;
  assetCount: number;
  imageReady: boolean;
  finalized: boolean;
  videoError: string | null;
  submitError: string | null;
  rendering: boolean;
  canQuery: boolean;
  hasResult: boolean;
  submissionUncertain: boolean;
  renderFailed?: boolean;
}

/** 只决定界面动作层级；生成门禁仍由原有业务校验与执行函数负责。 */
export function salesStageActions(context: SalesStageContext): SalesStageActions {
  const c = context;
  const action = (label: string, intent: SalesActionIntent, disabled = c.busy): ViewAction => ({ label, intent, disabled });
  if (c.rendering) return { primary: action('正在生成视频', 'result', true), secondary: action('停止继续提交', 'stop', false), note: '已提交的任务仍可能生成并计费，停止仅阻止后续提交或查询。' };
  if (c.busy && !c.rendering) return { primary: action(c.progress || '正在处理', 'product', true), secondary: action('停止当前操作', 'stop', false), note: '停止后保留已完成结果；服务商已接受的任务仍可能生成并计费。' };
  if (c.step === 'product') return {
    primary: action(c.progress || (c.collected ? '生成卖点与脚本' : '采集商品并生成卖点脚本'), 'write', c.busy || Boolean(c.planReason)),
    reason: c.planReason,
    secondary: c.hasScript ? action('返回原创作阶段', 'resume') : undefined,
  };
  if (c.step === 'result') {
    if (c.hasResult) return { primary: action(c.canQuery || c.submissionUncertain || c.renderFailed ? '下载已有成片' : '下载完整视频', 'download'), secondary: c.canQuery ? action('继续查询原任务', 'query') : action('返回视频生成', 'video'), reason: c.renderFailed ? '本次生成失败，已有成片仍保留，没有被这次任务替换。' : c.submissionUncertain && !c.canQuery ? '新提交结果未确认且没有回执，可在上方填入渠道任务 ID 继续查询；已有成片仍可下载。' : null };
    if (c.canQuery) return { primary: action('继续查询原任务', 'query'), secondary: action('返回视频生成', 'video'), note: '仅查询已有回执，不重新提交或创建计费任务。' };
    if (c.renderFailed) return { primary: action('返回视频生成', 'video'), reason: '视频生成失败，请查看上方原因并调整后再生成。' };
    if (c.submissionUncertain) return { primary: action('返回视频生成', 'video'), reason: '提交结果未确认且没有回执，可在上方填入渠道任务 ID 继续查询，或核实未提交后准备新草稿。' };
    return { primary: action(c.hasScript ? '去视频生成' : '去商品采集', c.hasScript ? 'video' : 'product') };
  }
  if (!c.hasScript) return { primary: action('去商品采集', 'product'), reason: '先采集商品资料并选择参考图，再提炼卖点和编写脚本。' };
  if (c.step === 'assets' && c.assetsQueryable) return { primary: action('继续查询原图片任务', 'queryAssets'), secondary: action('返回卖点与脚本', 'plan'), note: '仅查询已有图片任务，不重新生图；查询完成后再补齐或确认素材。' };
  if (c.step === 'assets' && c.assetsUnresolved) return { primary: action('图片提交结果待核实', 'prepare', true), secondary: action('返回卖点与脚本', 'plan'), reason: '部分图片没有返回任务回执，请先核对服务商记录，避免重复计费。' };
  if (c.step === 'plan') return c.planCurrent ? {
    primary: action('确认脚本，补齐素材', 'assets'),
    secondary: action('重新生成卖点与脚本', 'write', c.busy || Boolean(c.planReason)),
    reason: c.planReason,
  } : {
    primary: action(c.progress || '更新卖点与脚本', 'write', c.busy || Boolean(c.planReason)),
    secondary: action('检查商品资料', 'product'),
    reason: c.planReason || '商品资料或创作参数已变化，请更新卖点与脚本。',
  };
  if (!c.planCurrent) return { primary: action('去更新卖点与脚本', 'plan'), reason: '当前脚本已过期，请先更新卖点与脚本再继续。' };
  if (c.step === 'assets') return {
    primary: c.assetsReady ? action('素材已确认，进入视频生成', 'video') : c.assetsGenerated ? action('图片无误，确认并继续', 'confirmAssets') : action(c.progress || (c.assetCount ? '补齐待生成素材（可能计费）' : '确认素材图片'), 'prepare', c.busy || (c.assetCount > 0 && !c.imageReady)),
    secondary: action('返回卖点与脚本', 'plan'),
    reason: !c.assetsReady && !c.assetsGenerated && c.assetCount > 0 && !c.imageReady ? '请先选择绘图模型。' : c.preflightError,
  };
  if (!c.assetsReady) return { primary: action('去完成素材与确认', 'assets'), reason: '请先完成必要素材并确认图片，再生成视频提示词。' };
  const finalize = action(c.progress || (c.finalized ? '重新生成视频提示词' : '生成视频提示词'), 'finalize', c.busy || Boolean(c.videoError));
  const render = action('确认生成整段视频（可能计费）', 'render', c.busy || Boolean(c.submitError) || !c.finalized);
  return {
    primary: c.finalized ? render : finalize,
    secondary: c.finalized ? finalize : undefined,
    reason: c.videoError || c.submitError,
    note: '提示词生成与视频生成分别确认；生成提示词不会自动提交视频。',
  };
}

export function salesSingleResultStatus(input: { rendering: boolean; hasResult: boolean; status?: string; hasReceipt: boolean }): string {
  if (input.rendering) return input.hasReceipt ? '正在查询视频任务' : '正在提交视频任务';
  if (input.status === 'uncertain') return '提交结果待确认';
  if (input.status === 'failed') return '视频生成失败';
  if (input.hasResult) return '成片已生成';
  if (input.status === 'generating') return '任务已提交，可继续查询';
  return '等待生成成片';
}
