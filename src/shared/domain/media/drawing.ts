/**
 * AI 种草生图模型与参数适配引擎
 */

import { listApprovedModels, vendorLabel } from '@shared/domain/models/modelCatalog';

export interface ImageGenModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  isPrimary?: boolean;
  supportedQualities: ('high' | 'medium' | 'low')[];
  defaultSize: string;
  supportEdits: boolean;
  badge?: string;
  description?: string;
}

export const IMAGE_GEN_MODELS: ImageGenModel[] = listApprovedModels('image').map((m) => ({
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
  { id: 'custom', name: '自定义', label: '自定义', ratio: 'custom', size: '3072x4096', iconType: 'custom' }
];

/**
 * 校验是否为有效的电商真实商品图片 (自动过滤 1x1 占位图、统计追踪图、空像素等)
 */
/**
 * 校验是否为有效的电商真实商品图片 / 社媒图片 (自动过滤 1x1 占位图、统计追踪图、空像素等)
 */
export function isProductImageUrl(rawUrl?: string | null): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  if (rawUrl.startsWith('data:image/') || rawUrl.startsWith('blob:')) return true;
  const clean = rawUrl.toLowerCase().trim();
  if (!clean || clean.length < 10) return false;
  
  // 排除纯网页及商品落地页 (避免误把 html 当作图片)
  if (
    clean.endsWith('.html') || 
    clean.endsWith('.htm') || 
    (clean.includes('item.jd.com') && !clean.includes('jfs/')) || 
    (clean.includes('item.taobao.com') && !clean.includes('imgextra')) || 
    (clean.includes('detail.tmall.com') && !clean.includes('imgextra'))
  ) {
    return false;
  }

  // 排除万邦/淘宝/京东等统计分析追踪像素、空白占位图、或微缩角标
  if (
    clean.includes('o0b.cn') || 
    clean.includes('i.php?t.png') || 
    clean.includes('space.gif') || 
    clean.includes('spacer.gif') || 
    clean.includes('1x1.gif') || 
    clean.includes('1x1.png') ||
    clean.includes('blank.gif') ||
    clean.includes('taesite') ||
    clean.includes('tongji') ||
    clean.includes('picon/') || 
    clean.includes('imagetools/') || 
    clean.includes('service_ico') || 
    clean.includes('devfe/') || 
    clean.includes('s48x48_') || 
    clean.includes('s54x54_') || 
    clean.includes('s30x30_') || 
    clean.includes('s20x20_') || 
    clean.includes('s60x60_') || 
    clean.includes('error-new') || 
    clean.includes('jisushenhe') || 
    clean.includes('spiderfont')
  ) {
    return false;
  }

  // 支持所有主流图片后缀或云存储图像处理参数
  const hasImgExt = /\.(jpg|jpeg|png|webp|gif|bmp|dpg|avif|heic|tiff)(\?|!|$)/i.test(clean) || 
    /(?:format\/|imageView2|imageMogr2|image_process|imageView|\.image|\.jpg|\.png|\.webp)/i.test(clean);

  // 支持所有主流电商与社媒图床域名
  const isKnownImgHost = /(360buyimg|alicdn|taobaocdn|jd\.com|tbcdn\.cn|pddpic\.com|yangkeduo\.com|douyinpic|xhscdn|xiaohongshu|ci\.xiaohongshu|byteimg|snssdk|pstatp|kuaishou|kwai|yximgs|sinaimg|weibo|hdslb|bilibili|r2\.dev|cos\.|oss-|qiniucdn|upaiyun)/i.test(clean);

  return hasImgExt || isKnownImgHost;
}

/**
 * 智能将电商与社媒平台 (京东 360buyimg、淘宝 alicdn、小红书 xhscdn/ci.xiaohongshu、拼多多 pddpic 等) 的 WebP / DPG 压缩后缀
 * 彻底清洗并还原为原画级高清晰度、无水印的原生母版 .jpg / .png 图片链接
 */
export function normalizeImageUrlToStandardJpg(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  if (!url) return '';

  // 如果是本地相对路径 (如 /inspirations/insp_1.jpg 或 /brand/...)、Base64 Data URL 或 Blob URL，直接原样返回
  if ((url.startsWith('/') && !url.startsWith('//')) || url.startsWith('data:image/') || url.startsWith('blob:')) {
    return url;
  }

  // 1. 协议补全与 HTTPS 自动升级 (避免生产 HTTPS 环境下的 Mixed Content 拦截)
  if (url.startsWith('//')) {
    url = 'https:' + url;
  } else if (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    url = 'https://' + url.slice(7);
  }

  // 2. 过滤无效统计追踪像素
  if (!isProductImageUrl(url)) {
    return '';
  }

  // 3. 小红书图床：保留官方 sns-img-*.xhscdn.com 原链（可 200 出图）
  // 若包含 ci.xiaohongshu.com，自动转为稳定且无需反盗链的 sns-img-hw.xhscdn.com 官方 CDN
  if (/ci\.xiaohongshu\.com/i.test(url)) {
    url = url.replace(/https?:\/\/ci\.xiaohongshu\.com/i, 'https://sns-img-hw.xhscdn.com');
  }
  if (/xhscdn\.com|xiaohongshu\.com/i.test(url)) {
    url = url.replace(/!nd_dft_[a-zA-Z0-9_]*$/i, '');
    url = url.replace(/![a-zA-Z0-9_\-.]*$/i, '');
  }

  // 4. 抖音 / 字节 (douyinpic.com / byteimg.com / pstatp.com) 典型格式清洗:
  // 例如: https://p3-sign.douyinpic.com/...~tplv-obj.image -> ...
  if (/douyinpic\.com|byteimg\.com|pstatp\.com/i.test(url)) {
    url = url.replace(/~tplv-[^?]+/i, '');
    url = url.replace(/~c5_[^?]+/i, '');
  }

  // 5. 京东 (360buyimg.com / jd.com) 典型格式清洗与彻底去水印 (100% 还原为官方 1440x1440 无水印原画母版):
  // 核心机理：京东通过 /n0/ 或 /popWaterMark/ 会动态叠加 "JD.COM 京东" 水印；
  // 而通过 /pcpubliccms/s1440x1440_jfs/ 则获取原始 1440x1440 原生无水印大图母版！
  if (/360buyimg\.com|jd\.com/i.test(url) || url.includes('jfs/')) {
    url = url.replace(/(?:https?:)?\/\/(?:[a-zA-Z0-9\-_]+\.)?360buyimg\.com\/(?:mobilecms\/|popWaterMark\/|popWareDetail\/|n\d+\/|sku\/|shaidan\/|babel\/|imgzone\/|pcpubliccms\/)?(?:s\d+x\d+_)?jfs\//i, 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_jfs/');
    
    if (url.startsWith('jfs/')) {
      url = 'https://img10.360buyimg.com/pcpubliccms/s1440x1440_' + url;
    }

    // 去除可能残留的尺寸限制前缀
    url = url.replace(/\/s\d+x\d+_(?!jfs)/i, '/');
    url = url.replace(/\/s\d+x\d+\//i, '/');

    // 去除 !q70.dpg.webp 或 !q70.dpg 或 !q70.jpg 等感叹号后缀及水印滤镜
    url = url.replace(/![a-zA-Z0-9_\-.]*$/i, '');
    // 去除 .dpg.webp / .dpg / .webp
    url = url.replace(/\.dpg\.webp$/i, '');
    url = url.replace(/\.dpg$/i, '');
    url = url.replace(/\.webp$/i, '.jpg');
    // 去除可能残留的 .jpg.webp
    url = url.replace(/\.(jpg|jpeg|png)\.webp$/i, '.$1');
  }

  // 6. 淘宝 / 天猫 (alicdn.com / taobaocdn.com / tbcdn.cn) 典型格式清洗:
  // 例如: https://img.alicdn.com/imgextra/i1/.../xxx.jpg_.webp -> xxx.jpg
  // 例如: https://img.alicdn.com/imgextra/i1/.../xxx.jpg_q90.jpg_.webp -> xxx.jpg
  // 例如: https://img.alicdn.com/imgextra/i4/.../xxx.jpg_430x430q90.jpg -> xxx.jpg
  if (/alicdn\.com|taobaocdn\.com|tbcdn\.cn/i.test(url)) {
    url = url.replace(/_\.webp$/i, '');
    url = url.replace(/_q\d+\.jpg.*$/i, '');
    url = url.replace(/_\d+x\d+.*$/i, '');
    url = url.replace(/\.\d+x\d+\.jpg.*$/i, '.jpg');
    url = url.replace(/_sum\.jpg.*$/i, '');
    url = url.replace(/_b\.jpg.*$/i, '');
    url = url.replace(/_m\.jpg.*$/i, '');
    url = url.replace(/_s\.jpg.*$/i, '');
    url = url.replace(/\.search\.jpg.*$/i, '.jpg');
    url = url.replace(/\.summ\.jpg.*$/i, '.jpg');
    url = url.replace(/\.webp$/i, '.jpg');
  }

  // 7. 拼多多 / 微店 (pddpic.com / yangkeduo.com):
  if (/pddpic\.com|yangkeduo\.com/i.test(url)) {
    url = url.replace(/\?imageView2\/.*format\/webp.*/i, '');
    url = url.replace(/\?imageView2\/.*$/i, '');
    url = url.replace(/\?imageMogr2\/.*$/i, '');
    url = url.replace(/\?image_process=.*$/i, '');
    url = url.replace(/\.webp$/i, '.jpeg');
  }

  // 8. 通用 WebP / 缩略图格式清洗与修正:
  url = url.replace(/\.(jpg|jpeg|png)![a-zA-Z0-9_\-.]*$/i, '.$1');
  url = url.replace(/\.(jpg|jpeg|png)\.webp$/i, '.$1');
  if (url.endsWith('.webp')) {
    url = url.slice(0, -5) + '.jpg';
  }

  return url;
}

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

/**
 * 4K 超清尺寸升级映射字典 (确保全通道直通 4K Ultra 生成管线)
 */
const RESOLUTION_4K_UPGRADE_MAP: Record<string, string> = {
  '1760x2348': '2448x3264',
  '2348x1760': '3264x2448',
  '1440x2560': '2160x3840',
  '2560x1440': '3840x2160',
  '1600x2400': '2160x3240',
  '2400x1600': '3240x2160',
  '1080x1920': '2160x3840',
  '1920x1080': '3840x2160'
};

// 🌟 Re-export prompt-engine for 100% backward compatibility
export * from '../prompts/prompt-engine';
import {
  cleanPromptText,
  ensureOriginalPromptSlots,
  getDynamicNegativePrompt,
} from '../prompts/prompt-engine';







/**
 * 适配不同模型的生图参数
 */
export function formatModelPayload(modelId: string, params: {
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
  hasHuman?: boolean;
  shotType?: string;
  hasFace?: boolean;
  plainMode?: boolean;
  omitQuality?: boolean;
}) {
  const resolvedModelId = (modelId && modelId.trim()) ? modelId.trim() : 'gpt-image-2';
  const isGptImage = resolvedModelId.toLowerCase().includes('gpt-image');
  const known =
    IMAGE_GEN_MODELS.find((m) => m.id === resolvedModelId) ||
    (isGptImage && resolvedModelId.endsWith('-2k')
      ? IMAGE_GEN_MODELS.find((m) => m.id === 'gpt-image-2-2k')
      : undefined) ||
    (isGptImage && resolvedModelId.endsWith('-4k')
      ? IMAGE_GEN_MODELS.find((m) => m.id === 'gpt-image-2-4k')
      : undefined);
  // 未登记模型仍用列表默认尺寸做参数推断，但必须保留真实 modelId
  const modelConfig = known || (isGptImage ? IMAGE_GEN_MODELS.find((m) => m.id === 'gpt-image-2') : undefined) || IMAGE_GEN_MODELS[0];

  // 校验并自适应 Quality
  let targetQuality: string | undefined;
  if (params.omitQuality) {
    targetQuality = undefined;
  } else if (params.quality !== undefined && params.quality !== null && params.quality !== '') {
    targetQuality = params.quality;
    if (!modelConfig.supportedQualities.includes(targetQuality as 'high' | 'medium' | 'low')) {
      targetQuality = modelConfig.supportedQualities[0] || 'medium';
    }
  } else {
    targetQuality = isGptImage ? 'medium' : 'high';
    if (!modelConfig.supportedQualities.includes(targetQuality as 'high' | 'medium' | 'low')) {
      targetQuality = modelConfig.supportedQualities[0] || 'medium';
    }
  }

  // 🌟 核心：智能解析用户指定或分镜自带的比例/尺寸，保证绝不发生 1:1 混乱
  const inputSize = params.size && params.size !== 'auto' ? params.size : modelConfig.defaultSize;
  const targetRatio = getAspectRatioFromSize(inputSize);
  const isExplicitPixelSize = /^\d+\s*x\s*\d+$/i.test(String(inputSize).trim());

  let targetResolution: string;
  if (isGptImage && isExplicitPixelSize) {
    // gpt-image：尊重显式像素，禁止 ratio 表强制升到 2448x3264
    targetResolution = String(inputSize).trim().replace(/\s+/g, '');
  } else if (isExplicitPixelSize) {
    targetResolution = String(inputSize).trim().replace(/\s+/g, '');
    if (params.quality === 'high' && RESOLUTION_4K_UPGRADE_MAP[targetResolution]) {
      targetResolution = RESOLUTION_4K_UPGRADE_MAP[targetResolution];
    }
  } else {
    targetResolution = RATIO_TO_RESOLUTION_MAP[targetRatio] || modelConfig.defaultSize;
    if (RESOLUTION_4K_UPGRADE_MAP[targetResolution]) {
      targetResolution = RESOLUTION_4K_UPGRADE_MAP[targetResolution];
    }
  }

  const hasProductRef = Boolean(
    (params as any).productImage ||
    (params as any).primaryImage ||
    ((params as any).images && (params as any).images.length > 0)
  );
  const isWorkshopOriginal = !params.plainMode && hasProductRef;

  const cleanedPrompt = params.plainMode || !isWorkshopOriginal
    ? cleanPromptText(params.prompt)
    : ensureOriginalPromptSlots(cleanPromptText(params.prompt), {
          hasHuman: params.hasHuman,
          hasFace: params.hasFace,
        });
  const dynamicNegative = getDynamicNegativePrompt({
    hasHuman: params.plainMode ? false : params.hasHuman,
    shotType: params.plainMode ? 'pure_product' : params.shotType,
    plainMode: params.plainMode,
  });

  return {
    model: resolvedModelId,
    prompt: cleanedPrompt,
    negative_prompt: dynamicNegative,
    negativePrompt: dynamicNegative,
    size: targetResolution,
    aspect_ratio: targetRatio,
    aspectRatio: targetRatio,
    ar: targetRatio,
    ...(targetQuality !== undefined ? { quality: targetQuality } : {}),
    n: params.n || 1
  };
}

/**
 * 统一画质标签：API 枚举 low/medium/high → 1K/2K/4K
 */
export function formatImageQualityLabel(quality?: string): string {
  if (quality === 'low') return '1K';
  if (quality === 'medium') return '2K';
  if (quality === 'high') return '4K';
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
  if (m.includes('nano-banana')) {
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

export * from '../prompts/prompt-engine';

