/**
 * AI 种草生图模型与参数适配引擎
 */

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

export const IMAGE_GEN_MODELS: ImageGenModel[] = [
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2 (4K Ultra)',
    shortName: 'GPT Image 2',
    provider: 'OpenAI',
    isPrimary: true,
    supportedQualities: ['high', 'medium', 'low'],
    defaultSize: '2448x3264',
    supportEdits: true,
    badge: '4K Ultra',
    description: 'OpenAI 顶级画质、4K 超清光影构图与高质感电商商拍'
  },
  {
    id: 'grok-imagine-image-2.0',
    name: 'Grok 4.1 Image',
    shortName: 'Grok 4.1 Image',
    provider: 'xAI',
    supportedQualities: ['medium', 'low'],
    defaultSize: '2448x3264',
    supportEdits: true,
    badge: '真实写实',
    description: 'xAI 旗舰写实光影与漫反射细节'
  },
  {
    id: 'gemini-3.1-flash-image-preview-4k',
    name: 'Gemini 3.1 Flash Image',
    shortName: 'Gemini 3.1 Image',
    provider: 'Google',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2448x3264',
    supportEdits: true,
    badge: '极速 4K',
    description: 'Google 旗舰多模态图文对齐与高保真商业生成'
  },
  {
    id: 'doubao-seedream-5-0-260128',
    name: 'Seedream 5.0 官',
    shortName: 'Seedream 5.0',
    provider: 'Bytedance',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2448x3264',
    supportEdits: true,
    badge: '电商旗舰',
    description: '火山引擎官方电商生成旗舰模型'
  }
];

export interface AspectRatioOption {
  id: string;
  name: string;
  label?: string;
  ratio: string;
  size: string;
  iconType: 'square' | 'wide' | 'tall' | 'standard' | 'portrait' | 'auto' | 'custom';
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: 'auto', name: '自适应', label: '自适应', ratio: 'auto', size: '2448x3264', iconType: 'auto' },
  { id: '1:1', name: '1:1', label: '1:1', ratio: '1:1', size: '2048x2048', iconType: 'square' },
  { id: '16:9', name: '16:9', label: '16:9', ratio: '16:9', size: '3840x2160', iconType: 'wide' },
  { id: '9:16', name: '9:16', label: '9:16', ratio: '9:16', size: '2160x3840', iconType: 'tall' },
  { id: '4:3', name: '4:3', label: '4:3', ratio: '4:3', size: '3264x2448', iconType: 'wide' },
  { id: '3:4', name: '3:4', label: '3:4', ratio: '3:4', size: '2448x3264', iconType: 'tall' },
  { id: '3:2', name: '3:2', label: '3:2', ratio: '3:2', size: '3240x2160', iconType: 'wide' },
  { id: '2:3', name: '2:3', label: '2:3', ratio: '2:3', size: '2160x3240', iconType: 'tall' },
  { id: '5:4', name: '5:4', label: '5:4', ratio: '5:4', size: '2560x2048', iconType: 'standard' },
  { id: '4:5', name: '4:5', label: '4:5', ratio: '4:5', size: '2048x2560', iconType: 'portrait' },
  { id: '21:9', name: '21:9', label: '21:9', ratio: '21:9', size: '3840x1620', iconType: 'wide' },
  { id: 'custom', name: '自定义', label: '自定义', ratio: 'custom', size: '2448x3264', iconType: 'custom' }
];

/**
 * 智能将电商平台 (京东 360buyimg、淘宝 alicdn、拼多多 pddpic 等) 的 WebP / DPG 压缩后缀
 * 彻底清洗并还原为原画级高清晰度标准 .jpg / .png 图片链接
 */
export function normalizeImageUrlToStandardJpg(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();

  // 1. 协议补全 (// -> https://)
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }

  // 2. 京东 (360buyimg.com / jd.com) 典型格式清洗:
  // 例如: https://m.360buyimg.com/mobilecms/s800x800_jfs/.../xxx.jpg!q70.dpg.webp -> xxx.jpg
  // 例如: https://img10.360buyimg.com/n1/s450x450_jfs/.../xxx.jpg.dpg -> xxx.jpg
  if (/360buyimg\.com|jd\.com/i.test(url)) {
    // 去除 !q70.dpg.webp 或 !q70.dpg 或 !q70.jpg 等感叹号后缀
    url = url.replace(/![a-zA-Z0-9_\-\.]*$/i, '');
    // 去除 .dpg.webp / .dpg / .webp
    url = url.replace(/\.dpg\.webp$/i, '');
    url = url.replace(/\.dpg$/i, '');
    url = url.replace(/\.webp$/i, '.jpg');
    // 去除可能残留的 .jpg.webp
    url = url.replace(/\.(jpg|jpeg|png)\.webp$/i, '.$1');
  }

  // 3. 淘宝 / 天猫 (alicdn.com / taobaocdn.com) 典型格式清洗:
  // 例如: https://img.alicdn.com/imgextra/i1/.../xxx.jpg_.webp -> xxx.jpg
  // 例如: https://img.alicdn.com/imgextra/i1/.../xxx.jpg_q90.jpg_.webp -> xxx.jpg
  if (/alicdn\.com|taobaocdn\.com/i.test(url)) {
    url = url.replace(/_\.webp$/i, '');
    url = url.replace(/_q\d+\.jpg.*$/i, '');
    url = url.replace(/_\d+x\d+.*$/i, '');
    url = url.replace(/\.webp$/i, '.jpg');
  }

  // 4. 拼多多 / 微店 (pddpic.com / yangkeduo.com):
  if (/pddpic\.com|yangkeduo\.com/i.test(url)) {
    url = url.replace(/\?imageView2\/.*format\/webp.*/i, '');
    url = url.replace(/\.webp$/i, '.jpeg');
  }

  // 5. 通用 WebP 格式清洗与修正:
  // 如果链接包含 .jpg! 或 .png! 或 .jpeg!
  url = url.replace(/\.(jpg|jpeg|png)![a-zA-Z0-9_\-\.]*$/i, '.$1');
  // 如果末尾是 .jpg.webp 或 .png.webp
  url = url.replace(/\.(jpg|jpeg|png)\.webp$/i, '.$1');
  // 如果是纯 .webp 文件且无其他扩展名，尝试替换为 .jpg
  if (url.endsWith('.webp')) {
    url = url.slice(0, -5) + '.jpg';
  }

  return url;
}

/**
 * 比例与真实超清像素分辨率对应表 (确保全通道直通 4K/2K 对应长宽比)
 */
export const RATIO_TO_RESOLUTION_MAP: Record<string, string> = {
  '3:4': '2448x3264',
  '4:3': '3264x2448',
  '9:16': '2160x3840',
  '16:9': '3840x2160',
  '1:1': '2048x2048',
  '2:3': '2160x3240',
  '3:2': '3240x2160',
  '4:5': '2048x2560',
  '5:4': '2560x2048',
  '21:9': '3840x1620',
  'auto': '2448x3264'
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

/**
 * 清洗提示词文本，去除 Markdown 标题、分镜前缀、会话对话废话及外层包裹引号等残留字符
 */
export function cleanPromptText(rawPrompt: string): string {
  if (!rawPrompt) return '';
  let text = rawPrompt.trim();

  // 1. 去除开头的代码块符号及残留的语言标签 (如 ```text, ```prompt, ```)
  text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
  text = text.replace(/^(?:text|prompt|markdown)\s*\n+/i, '');

  // 2. 去除开头的引用符号
  text = text.replace(/^>\s*/gm, '');

  // 3. 去除首尾包裹的中英文双引号或单引号
  text = text.replace(/^["'“‘]+/, '').replace(/["'”’]+$/, '').trim();

  // 4. 去除类似 "#### 图1: 首页封面" 或 "【图1】" 或 "分镜1:" 这种标题行
  text = text.replace(/^(?:#{1,4}\s*)?(?:📸\s*)?(?:第\s*\d+\s*张|分镜\s*\d+|图\s*\d+|方案\s*\d+|画面\s*\d+)[^\n]*[\n\r]+/i, '');
  text = text.replace(/^(?:【|\[)?(?:第\s*\d+\s*张|分镜\s*\d+|图\s*\d+|方案\s*\d+|画面\s*\d+)[^】\]\n\r]*[】\]]?[:：\s]*/i, '');

  // 5. 去除可能残留的 "提示词：" 前缀
  text = text.replace(/^(?:提示词(?:（[^）]+）)?|Prompt|核心提示词)[:：\s]*/i, '');

  // 6. 清洗并标准化多模态实物与构图参考图占位符
  text = text.replace(/【(?:参考图\s*1\s*所示商品|图中商品|目标商品|商品实物|图\s*1\s*实物)】/g, '@图片1');
  text = text.replace(/【(?:参考图\s*2|图\s*2\s*构图|构图参考图)】/g, '@图片2');
  text = text.replace(/【?图\s*1】?(?:中的)?(?:主商品|商品|实物)?/g, '@图片1');
  text = text.replace(/【?图\s*2】?(?:中的)?(?:构图|置景|场景)?/g, '@图片2');
  text = text.replace(/\b(?:from\s+Image\s*1|in\s+Image\s*1|of\s+Image\s*1)\b/gi, '@图片1');
  text = text.replace(/\b(?:from\s+Image\s*2|in\s+Image\s*2|of\s+Image\s*2)\b/gi, '@图片2');

  // 7. 去除排版文字/贴纸标语描述 (如 "Text Overlay: ...", "Sticker overlay: ...", "Graphic overlay: ...")
  text = text.replace(/(?:Text Overlay|Sticker overlay|Graphic overlay|排版文字|文案标注|文字排版建议|字幕贴纸)[：:]\s*[\s\S]*?(?=\n\n|\n[A-Z][a-zA-Z\s]+:|$)/gi, '');

  // 8. 去除 AI 助手会话式引导废话 (如: "复制给 GPT-4...", "把图1抠图放进去...", "祝你数据长虹")
  text = text.replace(/(?:复制给\s*(?:GPT-4|ChatGPT|大模型|AI)[^，。\n]*[，。\n]*)/gi, '');
  text = text.replace(/(?:拿到有质感的背景后[^，。\n]*[，。\n]*)/gi, '');
  text = text.replace(/(?:把你的图\s*\d*\s*抠图放进去[^，。\n]*[，。\n]*)/gi, '');
  text = text.replace(/(?:加上这些文案[^，。\n]*[，。\n]*)/gi, '');
  text = text.replace(/(?:一篇爆款小红书图文就诞生了[^，。\n]*[，。\n]*)/gi, '');
  text = text.replace(/(?:祝你数据长虹[^！!\n]*[！!\n]*)/gi, '');
  text = text.replace(/(?:Leave some empty space at the top for adding text later\.?)/gi, '');

  // 9. 去除多余的参数尾巴（如果已经被模型解析了宽高比）
  text = text.replace(/--ar\s+[0-9:]+/gi, '').replace(/--v\s+[0-9.]+/gi, '').replace(/--q\s+[0-9.]+/gi, '');

  // 11. 标准化各大平台/社区多图引用占位符 (将 {{Mixed 1}}, @insp_1 等规范化映射为行业通用多模态指令 @图片1, @图片2)
  text = text.replace(/\{\{\s*(?:Mixed|Image|Video|Subject|Pic|图|视频|主体)?\s*(\d+)\s*\}\}/gi, '@图片$1');
  text = text.replace(/@insp_(\d+)/gi, '@图片$1');
  text = text.replace(/\{\{\s*[^}]+\s*\}\}/g, '');

  // 12. 清理 Markdown 结构化分段标头 (如 **画面描述**:, **动作与镜头**:, **氛围与情绪**:, **运镜**:, **场景背景**:)
  text = text.replace(/\*\*(?:画面描述|画面|主体描述|主体|人物描述|人物|动作与镜头|动作|运镜|镜头|场景背景|场景|环境|氛围与情绪|氛围|情绪|光影|构图|色彩|服饰|服装|材质|细节)\*\*[:：\s]*/g, ' ');
  text = text.replace(/(?:画面描述|主体描述|动作与镜头|场景背景|氛围与情绪|镜头动作|切镜头剪辑)[:：]\s*/g, ' ');

  // 13. 去除残留的 Markdown 粗体与斜体标记 (如 **词语** -> 词语, *词语* -> 词语)
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');

  // 14. 清理冗余的连续标点与空白字符 (如 "，，", "。。", "；；", 多余首尾符号)
  text = text.replace(/[，,]{2,}/g, '，');
  text = text.replace(/[。\.]{2,}/g, '。');
  text = text.replace(/[；;]{2,}/g, '；');
  text = text.replace(/^[，,。\.；;\s]+/, '');
  text = text.replace(/[，,；;\s]+$/, '');
  text = text.replace(/\s+/g, ' ');

  // 10. 再次清理首尾标点与多余空格
  text = text.replace(/^["'“‘]+/, '').replace(/["'”’]+$/, '').trim();

  return text.trim() || rawPrompt.trim();
}

/**
 * 动静分离的动态负向提示词引擎
 * 根据分镜是否有模特/手部出镜，精准分配排斥规则，彻底排斥鼠标指针与截屏UI工件
 */
export function getDynamicNegativePrompt(options?: { hasHuman?: boolean; shotType?: string }): string {
  const hasHuman = options?.hasHuman !== false && options?.shotType !== 'pure_product';
  
  // 🌟 截屏工件与鼠标光标通用排斥词 (防止采集自社交媒体截屏图中的系统UI/鼠标元素被生图模型复刻)
  const screenshotArtifacts = 'cursor, mouse cursor, mouse pointer, arrow cursor, hand cursor, pointer icon, UI overlay, screenshot artifact, browser chrome, browser toolbar, address bar, taskbar, desktop icons, system tray, window controls, minimize button, close button, scrollbar, notification popup';

  if (!hasHuman) {
    // 纯静物 / 商业实物特写专属负向词 (精准排斥鼠标光标、商业海报广告文案、参数列表、粗劣 3D 渲染、假塑料反光、暗室死黑)
    return `${screenshotArtifacts}, promotional poster, marketing banner, text overlay, typography, Chinese text watermark, spec icons, parameter table, commercial advertisement, billboard, graphic design poster, spec sheet, product brochure, extra arms, human limbs, extra hands, mutated fingers, human in background, floating object, anti-gravity, distorted geometry, malformed product, plastic fake reflection, cheap CGI, 3d render, blender render, unreal engine, clay material, fake specular highlights, cheesy retro racing game, fake neon speedometer, arcade car game, low quality 3d car dashboard, cheap synthwave grid, ugly neon gauges, fake glowing ui, blurry fake video game, blurry, low resolution, watermark, ugly text artifact, oversaturated, unrealistic perspective, dark gloomy lighting, muddy black shadows, cheap black plastic clutter, red greasy wood table, dirty messy desk, unlit dark room, low contrast murky colors, empty blank desk, flat sterile lighting, plastic toy look, washed out colors, harsh flat light`;
  }
  
  // 真人模特 / 手持操作专属负向词 (排斥鼠标光标、商业海报文字、多手多臂、面具假脸、解剖学畸变与粗劣 3D)
  return `${screenshotArtifacts}, promotional poster, marketing banner, text overlay, typography, Chinese text watermark, spec icons, parameter table, commercial advertisement, billboard, extra arms, three arms, floating arms, third arm, extra hands, missing arms, duplicate limbs, bad hands, mutated fingers, bad anatomy, deformed limbs, floating hand holding phone, detached arms, deformed hands, distorted fingers, extra fingers, missing fingers, malformed camera bump, extra lenses, distorted phone body, plastic skin, fake face, mask face, double faces, over-smoothed skin, 3d render, cheap CGI, unreal engine, blender render, cheesy retro racing game, fake neon speedometer, mutated body parts, low quality, blurry, watermark, ugly, text artifact, dark gloomy lighting, muddy black shadows`;
}

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
}) {
  const modelConfig = IMAGE_GEN_MODELS.find(m => m.id === modelId) || IMAGE_GEN_MODELS[0];
  
  // 校验并自适应 Quality
  let targetQuality = params.quality || 'high';
  if (!modelConfig.supportedQualities.includes(targetQuality as 'high' | 'medium' | 'low')) {
    targetQuality = modelConfig.supportedQualities[0] || 'medium';
  }

  // 🌟 核心：智能解析用户指定或分镜自带的比例/尺寸，保证绝不发生 1:1 混乱
  const inputSize = params.size && params.size !== 'auto' ? params.size : modelConfig.defaultSize;
  const targetRatio = getAspectRatioFromSize(inputSize);
  let targetResolution = RATIO_TO_RESOLUTION_MAP[targetRatio] || modelConfig.defaultSize;

  // 4K Ultra 超清自动升档保障
  if (RESOLUTION_4K_UPGRADE_MAP[targetResolution]) {
    targetResolution = RESOLUTION_4K_UPGRADE_MAP[targetResolution];
  }

  const cleanedPrompt = cleanPromptText(params.prompt);
  const dynamicNegative = getDynamicNegativePrompt({ hasHuman: params.hasHuman, shotType: params.shotType });

  return {
    model: modelConfig.id,
    prompt: cleanedPrompt,
    negative_prompt: dynamicNegative,
    negativePrompt: dynamicNegative,
    size: targetResolution,
    aspect_ratio: targetRatio,
    aspectRatio: targetRatio,
    ar: targetRatio,
    quality: targetQuality,
    n: params.n || 1
  };
}

/**
 * 统一友好的模型名称格式化工具
 */
export function formatDisplayModel(model?: string, isVideo?: boolean): string {
  if (!model) return isVideo ? '即梦 Seedance' : 'GPT Image 2';
  const m = model.toLowerCase().trim();
  if (m === 'minimax-h3' || m.includes('h3')) return 'MiniMax-H3';
  if (m.includes('hailuo-02')) return '海螺 02';
  if (m.includes('hailuo') || m.includes('minimax')) return 'MiniMax 海螺';
  if (m.includes('seedance-2.5')) return 'Seedance 2.5';
  if (m.includes('seedance-2.0-mini') || m.includes('seedance-2-0-mini') || m.includes('seedance-mini')) return 'Seedance 2.0 mini';
  if (m.includes('seedance-2.0') || m.includes('seedance-2-0')) return 'Seedance 2.0';
  if (m.includes('seedance-1.5') || m.includes('seedance-1-5')) return 'Seedance 1.5';
  if (m.includes('seedance')) return 'Seedance';
  if (m.includes('veo3.1') || m.includes('veo-3.1')) return 'Veo 3.1';
  if (m.includes('veo3') || m.includes('veo-3')) return 'Veo 3.0';
  if (m.includes('veo2') || m.includes('veo-2') || m.includes('veo')) return 'Veo 2.0';
  if (m.includes('sora-2') || m.includes('sora')) return 'Sora 2.0';
  if (m.includes('kling-v2') || m.includes('kling-2')) return '可灵 2.0';
  if (m.includes('kling') || m.includes('keling')) return '可灵 Kling';
  if (m.includes('wan2.6') || m.includes('wan-2.6')) return '通义万相 2.6';
  if (m.includes('wan2.1') || m.includes('wan-2.1') || m.includes('wan')) return '通义万相 2.1';
  if (m.includes('gpt-image-2') || m.includes('gpt-image')) return 'GPT Image 2';
  if (m.includes('flux')) return 'FLUX';
  if (m.includes('recraft')) return 'Recraft V3';
  if (m.includes('midjourney') || m.includes('mj')) return 'Midjourney';
  if (m.includes('seedream')) return 'Seedream 5.0';
  if (m.includes('grok')) return 'Grok 4.1';
  return model;
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


