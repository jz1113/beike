/**
 * AI 种草生图模型与参数适配引擎
 */

import { listSelectableModels, vendorLabel } from '@shared/domain/models/modelCatalog';

export interface ImageGenModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  isPrimary?: boolean;
  supportedQualities: ('max' | 'xhigh' | 'high' | 'medium' | 'low')[];
  defaultSize: string;
  supportEdits: boolean;
  badge?: string;
  description?: string;
}

export const IMAGE_GEN_MODELS: ImageGenModel[] = listSelectableModels('image').map((m) => ({
  id: m.id,
  name: m.name,
  shortName: m.shortName,
  provider: vendorLabel(m.vendor),
  isPrimary: m.isPrimary,
  supportedQualities: m.supportedQualities || ['high', 'medium', 'low'],
  defaultSize: m.defaultSize || '1024x1024',
  supportEdits: m.supportEdits ?? true,
  badge: m.badge,
  description: m.description,
}));

export interface AspectRatioOption {
  id: string;
  name: string;
  label?: string;
  ratio: string;
  size: string;
  iconType: 'square' | 'wide' | 'tall' | 'standard' | 'portrait' | 'auto' | 'custom';
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: 'auto', name: '自适应', label: '自适应', ratio: 'auto', size: '3072x4096', iconType: 'auto' },
  { id: '1:1', name: '1:1', label: '1:1', ratio: '1:1', size: '3072x3072', iconType: 'square' },
  { id: '16:9', name: '16:9', label: '16:9', ratio: '16:9', size: '3840x2160', iconType: 'wide' },
  { id: '9:16', name: '9:16', label: '9:16', ratio: '9:16', size: '2160x3840', iconType: 'tall' },
  { id: '4:3', name: '4:3', label: '4:3', ratio: '4:3', size: '4096x3072', iconType: 'wide' },
  { id: '3:4', name: '3:4', label: '3:4', ratio: '3:4', size: '3072x4096', iconType: 'tall' },
  { id: '3:2', name: '3:2', label: '3:2', ratio: '3:2', size: '3240x2160', iconType: 'wide' },
  { id: '2:3', name: '2:3', label: '2:3', ratio: '2:3', size: '2160x3240', iconType: 'tall' },
  { id: '5:4', name: '5:4', label: '5:4', ratio: '5:4', size: '2560x2048', iconType: 'standard' },
  { id: '4:5', name: '4:5', label: '4:5', ratio: '4:5', size: '2048x2560', iconType: 'portrait' },
  { id: '21:9', name: '21:9', label: '21:9', ratio: '21:9', size: '3840x1620', iconType: 'wide' },
  { id: '4:1', name: '4:1', label: '4:1', ratio: '4:1', size: '4096x1024', iconType: 'wide' },
  { id: '1:4', name: '1:4', label: '1:4', ratio: '1:4', size: '1024x4096', iconType: 'tall' },
  { id: '8:1', name: '8:1', label: '8:1', ratio: '8:1', size: '6144x768', iconType: 'wide' },
  { id: '1:8', name: '1:8', label: '1:8', ratio: '1:8', size: '768x6144', iconType: 'tall' },
  { id: 'custom', name: '自定义', label: '自定义', ratio: 'custom', size: '3072x4096', iconType: 'custom' }
];

export { isProductImageUrl, normalizeImageUrlToStandardJpg, normalizeImageSource, normalizeRemoteMediaUrl, isKnownSocialImageHost } from './imageUrls';

/**
 * 比例与真实超清像素分辨率对应表 (确保全通道直通 4K/2K 对应长宽比)
 */
export const RATIO_TO_RESOLUTION_MAP: Record<string, string> = {
  '3:4': '3072x4096',
  '4:3': '4096x3072',
  '9:16': '2160x3840',
  '16:9': '3840x2160',
  '1:1': '3072x3072',
  '2:3': '2160x3240',
  '3:2': '3240x2160',
  '4:5': '2048x2560',
  '5:4': '2560x2048',
  '21:9': '3840x1620',
  '1:4': '1024x4096',
  '4:1': '4096x1024',
  '1:8': '768x6144',
  '8:1': '6144x768',
  'auto': '3072x4096'
};

/**
 * 智能从任何比例或像素分辨率字符串中提取标准宽高比 (如 '2448x3264' => '3:4')
 */
export function getAspectRatioFromSize(sizeStr?: string): string {
  if (!sizeStr) return '3:4';
  const clean = sizeStr.trim();
  if (clean === 'auto') return '3:4';
  if (RATIO_TO_RESOLUTION_MAP[clean]) return clean; // 传入的就是 '3:4', '1:1' 等

  if (clean.includes('x')) {
    const [w, h] = clean.split('x').map(Number);
    if (w && h && !isNaN(w) && !isNaN(h)) {
      const r = w / h;
      if (w === 792 && h === 168) return '21:9';
      if (Math.abs(r - 0.125) < 0.05) return '1:8';
      if (Math.abs(r - 0.25) < 0.06) return '1:4';
      if (Math.abs(r - 4) < 0.4) return '4:1';
      if (Math.abs(r - 8) < 0.8) return '8:1';
      if (Math.abs(r - 1) < 0.08) return '1:1';
      if (Math.abs(r - 0.75) < 0.08) return '3:4';
      if (Math.abs(r - 1.333) < 0.08) return '4:3';
      if (Math.abs(r - 0.5625) < 0.08) return '9:16';
      if (Math.abs(r - 1.777) < 0.08) return '16:9';
      if (Math.abs(r - 0.666) < 0.08) return '2:3';
      if (Math.abs(r - 1.5) < 0.08) return '3:2';
      if (Math.abs(r - 0.8) < 0.08) return '4:5';
      if (Math.abs(r - 1.25) < 0.08) return '5:4';
      if (Math.abs(r - 2.37) < 0.1) return '21:9';
    }
  }
  return '3:4';
}

// 🌟 Re-export prompt-engine for 100% backward compatibility
export * from '../prompts/prompt-engine/mentions';
export * from '../prompts/prompt-engine/multiAngle';

/**
 * 统一画质标签：API 枚举 low/medium/high → 1K/2K/4K
 */
export function formatImageQualityLabel(quality?: string): string {
  if (quality === 'low') return '1K';
  if (quality === 'medium') return '2K';
  if (quality === 'high' || quality === 'xhigh' || quality === 'max') return '4K';
  if (quality === '1K' || quality === '2K' || quality === '4K') return quality;
  return '2K';
}

/**
 * 深度生成清晰度标签：fast/standard/high → 快速/标准/高清
 */
export function formatDepthQualityLabel(quality?: string): string {
  if (quality === 'fast') return '快速';
  if (quality === 'standard') return '标准';
  if (quality === 'high') return '高清';
  return '标准';
}

export function isDepthMediaType(mediaType?: string): boolean {
  return mediaType === 'depth-image' || mediaType === 'depth-video';
}

/**
 * 统一友好的模型名称格式化工具
 */
export function formatDisplayModel(model?: string, isVideo?: boolean): string {
  if (!model) return isVideo ? 'Seedance' : 'GPT Image 2';
  const m = model.toLowerCase().trim();
  const builtin = IMAGE_GEN_MODELS.find((x) => x.id.toLowerCase() === m);
  if (builtin) return builtin.shortName;
  const labels: Record<string, string> = {
    'minimax-h3': 'MiniMax-H3', 'doubao-seedance-2.5': 'Seedance 2.5',
    'doubao-seedance-2.0-mini': 'Seedance 2.0 mini', 'veo3.1': 'Veo 3.1',
    'veo3': 'Veo 3.0', 'veo2': 'Veo 2.0', 'sora-2': 'Sora 2.0',
    'image2-4k': 'GPT Image 2 4K',
  };
  if (labels[m]) return labels[m];
  // Unknown catalogue variants retain their complete ID, including version/tier.

  return model;
}

/**
 * 卡片角标等紧凑场景用的模型名（截断过长 id，保留完整名于 title）
 */
export function formatDisplayModelCompact(
  model?: string,
  isVideo?: boolean,
  maxLen = 12,
): string {
  const full = formatDisplayModel(model, isVideo);
  const m = (model || '').toLowerCase();
  if (m.includes('nano-banana') || (m.includes('gemini') && m.includes('image'))) {
    if (m.includes('2.1')) return 'Banana 2.1';
    if (m.includes('lite')) return 'Banana Lite';
    if (m.includes('pro')) return 'Banana Pro';
    if (m.includes('2k') || m.includes('2-2k')) return 'Banana 2K';
    return 'Banana 2';
  }
  if (full.length <= maxLen) return full;
  return full.slice(0, maxLen - 1) + '…';
}

/**
 * 智能将单段长提示词按照语义句意（句号、分号、换行）切分为结构清晰、呼吸感良好的段落
 */
export function formatPromptParagraphs(prompt?: string): string[] {
  if (!prompt) return [];
  const text = prompt.trim();

  // 1. 如果已经包含多行换行，直接按换行切分
  if (text.includes('\n')) {
    return text.split('\n').map(p => p.trim()).filter(Boolean);
  }

  // 2. 如果是连续长文本，按句号/分号/问号分句
  const sentences = text.split(/(?<=[。！？；\n])\s*/).filter(Boolean);
  if (sentences.length <= 1) return [text];

  const paragraphs: string[] = [];
  let current = '';

  for (const s of sentences) {
    // 每段大约 50~70 字，保持舒适的阅读节奏与段落呼吸感
    if ((current + s).length > 60 && current) {
      paragraphs.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) {
    paragraphs.push(current.trim());
  }

  return paragraphs.length > 0 ? paragraphs : [text];
}

