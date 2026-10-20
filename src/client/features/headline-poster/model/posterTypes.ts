import type { CoverFormat } from './coverFormat';

/**
 * `interrupted` is deliberately distinct from `failed`: it means the browser
 * or user stopped an in-flight request, so the item can safely be continued.
 */
export type PosterStatus = 'idle' | 'rewriting' | 'prompting' | 'rendering' | 'interrupted' | 'complete' | 'failed';
export type ImageQuality = 'high' | 'medium' | 'low';
export type PosterTitleHandling = 'rewrite' | 'original';

export interface CoverDesignPlan {
  name: string;
  rationale: string;
  palette: string;
  composition: string;
  material: string;
  typography: string;
  visualAnchor: string;
  generationDirection: string;
  eyebrow: string;
  supportLine: string;
  titleLines: string[];
  layout: string;
  typeface: string;
  textColor: string;
  background: string;
  subject: string;
  harmony: string;
  variation: string;
}

export interface PosterItem {
  id: string;
  sourceImageUrl: string;
  originalTitle: string;
  productName: string;
  format: CoverFormat;
  coverTitle: string;
  isTitleEdited?: boolean;
  prompt?: string;
  promptVersion?: string;
  designPlan?: CoverDesignPlan;
  resultUrl?: string;
  /** IndexedDB cache key used to recover completed local JPGs after a restart. */
  persistedResultKey?: string;
  /** Import validation failures must be corrected before a paid request is sent. */
  importError?: string;
  /** Reconcile the original image request before submitting another paid task. */
  imageTaskId?: string;
  imageSubmissionKey?: string;
  generatedSceneUrl?: string;
  generationRecoveryRequired?: boolean;
  status: PosterStatus;
  error?: string;
  /** Records a successful automatic title/design model fallback for the current run. */
  modelFallbackNote?: string;
  /** The adopted sample pinned for this cover. Retries keep the same reference. */
  memorySampleId?: string;
  memoryEntryIds?: string[];
}

export interface PosterProductionSettings {
  imageModel: string;
  titleModel: string;
  titleHandling: PosterTitleHandling;
  imageQuality: ImageQuality;
  concurrency: number;
  /** Empty means the server picks one adopted sample when design starts. */
  memorySampleId: string;
}

export interface HeadlineDesignResponse {
  title?: string;
  titleLines?: string[];
  productNameLine?: string;
  eyebrow?: string;
  supportLine?: string;
  composition?: string;
  material?: string;
  palette?: string;
  typographySystem?: string;
  typography?: string;
  sceneStructure?: 'product-hero' | 'use-case' | 'visual-evidence' | 'lifestyle' | 'source-collage';
  visualAnchor?: string;
  imagePrompt?: string;
  styleFamily?: string;
  layout?: string;
  typeface?: string;
  textColor?: string;
  background?: string;
  subject?: string;
  harmony?: string;
  variation?: string;
}

export interface HeadlineTitleResponse {
  title?: string;
}

export const POSTER_PRODUCTION_SETTINGS_KEY = 'headline_poster_production_settings';
export const POSTER_CONCURRENCY_OPTIONS = [5, 10, 15, 20, 25, 30] as const;
export const MAX_POSTER_CONCURRENCY = POSTER_CONCURRENCY_OPTIONS[POSTER_CONCURRENCY_OPTIONS.length - 1];

/**
 * The selected model remains this task's primary model. Every later attempt
 * follows the order shown in Model Management, from top to bottom. The caller
 * supplies only configured multimodal models, so an unconfigured model can
 * never become an automatic fallback.
 */
export function buildPosterTitleModelFallbackChain(selectedModel: string, configuredModelIds: readonly string[]): string[] {
  const seen = new Set<string>();
  return [selectedModel, ...configuredModelIds]
    .map((modelId) => String(modelId || '').trim())
    .filter((modelId) => {
      const key = modelId.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function makeId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `poster_${globalThis.crypto.randomUUID()}`;
  return `poster_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function cleanCell(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeCoverTitle(value: string): string {
  return value
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[“”"'‘’【】\u005B\u005D（）()]/g, '')
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：]/g, '')
    .trim();
}

export function normalizeProductName(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isPosterImageUrl(value: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
      && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function posterInputError(item: Pick<PosterItem, 'sourceImageUrl' | 'originalTitle' | 'importError'> & Partial<Pick<PosterItem, 'productName'>>): string | undefined {
  if (item.importError) return item.importError;
  if (!item.sourceImageUrl.trim()) return '缺少图片链接，请补充后重新导入';
  if (!isPosterImageUrl(item.sourceImageUrl.trim())) return '图片链接必须为完整有效的 http:// 或 https:// 地址';
  if (!item.originalTitle.trim()) return '缺少原标题，请补充后重新导入';
  if (item.originalTitle.trim().length > 2000) return '原标题最多 2000 字，请缩短后重新导入';
  if (item.productName && normalizeProductName(item.productName).length > 64) return '商品名称/型号最多 64 字，请修正后重新导入；未自动截断名称';
  return undefined;
}

export function safeBaseName(title: string, fallback: string): string {
  const name = (title || fallback)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/g, '') || fallback;
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name;
}

export function normalizeConcurrency(value: unknown, fallback = POSTER_CONCURRENCY_OPTIONS[0]): number {
  const numeric = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return POSTER_CONCURRENCY_OPTIONS.reduce((nearest, candidate) => (
    Math.abs(candidate - numeric) < Math.abs(nearest - numeric) ? candidate : nearest
  ));
}

export function normalizeTitleHandling(value: unknown): PosterTitleHandling {
  return value === 'original' ? 'original' : 'rewrite';
}

/** A manually entered cover title is always intentional and is never overwritten. */
export function shouldRewriteCoverTitle(item: PosterItem, titleHandling: PosterTitleHandling): boolean {
  return titleHandling === 'rewrite' && !item.isTitleEdited;
}

export function preservedOriginalTitle(item: PosterItem): string {
  return item.originalTitle.trim();
}

export function stageLabel(status: PosterStatus): string {
  const labels: Record<PosterStatus, string> = {
    idle: '待开始', rewriting: '正在优化标题', prompting: '正在设计提示词',
    rendering: '正在生成画面并定稿封面', interrupted: '已中断，可继续', complete: '已完成', failed: '生成失败',
  };
  return labels[status];
}

export function modelLabel(model: { id: string; name?: string; shortName?: string } | undefined, fallback: string): string {
  return model?.shortName || model?.name || fallback;
}

export function buildDesignPlan(coverTitle: string, director: HeadlineDesignResponse): CoverDesignPlan {
  if (director.title !== coverTitle || !director.imagePrompt?.trim()
    || !Array.isArray(director.titleLines) || !director.titleLines.length
    || director.titleLines.join('') !== coverTitle) {
    throw new Error('完整设计方案缺少准确标题或语义断行，请更新服务端后重试');
  }
  return {
    name: director.styleFamily || '独立封面设计',
    rationale: '商品、场景与艺术字由同一完整提示词统一生成',
    palette: director.palette || '', composition: director.composition || '',
    material: director.material || '', typography: director.typography || '',
    visualAnchor: director.visualAnchor || '',
    generationDirection: director.imagePrompt.trim(),
    titleLines: director.titleLines, eyebrow: '', supportLine: '',
    layout: director.layout || '',
    typeface: director.typeface || '',
    textColor: director.textColor || '',
    background: director.background || '',
    subject: director.subject || '',
    harmony: director.harmony || '',
    variation: director.variation || '',
  };
}

export function previousDesignSummary(plan: CoverDesignPlan | undefined): string {
  if (!plan) return '';
  return [plan.layout, plan.typeface, plan.textColor, plan.background, plan.subject].filter(Boolean).join('；').slice(0, 500);
}
