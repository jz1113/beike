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
    name: 'GPT Image 2 (标准)',
    shortName: 'GPT Image 2',
    provider: 'OpenAI',
    isPrimary: true,
    supportedQualities: ['high', 'medium', 'low'],
    defaultSize: '2448x3264',
    supportEdits: true,
    badge: '4K标准',
    description: 'OpenAI 官方文档标准通道，支持 low/medium/high 画质与参考图编辑'
  },
  {
    id: 'gpt-image-2-4k',
    name: 'GPT Image 2 4K (专线)',
    shortName: 'GPT Image 2 4K',
    provider: 'OpenAI',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2048x2048',
    supportEdits: true,
    badge: '4K专线',
    description: 'OpenAI 4K 高分辨率专线加速通道'
  },
  {
    id: 'gpt-image-2-2k',
    name: 'GPT Image 2 2K',
    shortName: 'GPT Image 2 2K',
    provider: 'OpenAI',
    supportedQualities: ['medium', 'low'],
    defaultSize: '1536x2048',
    supportEdits: true,
    badge: '2K',
    description: 'comfly 网关 2K 档位 model id（gpt-image-2-2k）'
  },
  {
    id: 'grok-imagine-image-2.0',
    name: 'Grok 4.1 Image',
    shortName: 'Grok 4.1 Image',
    provider: 'xAI',
    supportedQualities: ['medium', 'low'],
    defaultSize: '2448x3264',
    supportEdits: false,
    badge: '真实写实',
    description: 'xAI 旗舰写实光影与漫反射细节'
  },
  {
    id: 'grok-4.2-image',
    name: 'Grok 4.2 Image',
    shortName: 'Grok 4.2 Image',
    provider: 'xAI',
    supportedQualities: ['medium', 'low'],
    defaultSize: '2448x3264',
    supportEdits: false,
    badge: '最新',
    description: 'xAI Grok 4.2 文生图（aspect_ratio 驱动）'
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
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    shortName: 'Nano Banana 2',
    provider: 'Google',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2448x3264',
    supportEdits: true,
    badge: '极速多图',
    description: 'Gemini 系极速多参考图生图通道'
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
  },
  {
    id: 'seedream-3.0',
    name: 'Seedream 3.0',
    shortName: 'Seedream 3.0',
    provider: 'Bytedance',
    supportedQualities: ['high', 'medium', 'low'],
    defaultSize: '2048x2048',
    supportEdits: true,
    badge: '极速生成',
    description: '低延迟电商主图与买家秀生成'
  },
  {
    id: 'flux-pro',
    name: 'Flux Pro',
    shortName: 'Flux Pro',
    provider: 'Black Forest Labs',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2048x2048',
    supportEdits: true,
    badge: '极致光影',
    description: 'Black Forest Labs 顶级商业质感生图模型'
  },
  {
    id: 'flux-kontext-pro',
    name: 'Flux Kontext Pro',
    shortName: 'Flux Kontext',
    provider: 'Black Forest Labs',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2048x2048',
    supportEdits: true,
    badge: '多图编辑',
    description: 'Flux Kontext 多图参考编辑生图'
  },
  {
    id: 'midjourney-v6',
    name: 'Midjourney v6.1',
    shortName: 'Midjourney',
    provider: 'Midjourney',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2048x2048',
    supportEdits: true,
    badge: '艺术质感',
    description: '艺术设计与高级摄影风格生图'
  },
  {
    id: 'recraft-v3',
    name: 'Recraft V3',
    shortName: 'Recraft',
    provider: 'Recraft',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2048x2048',
    supportEdits: false,
    badge: '设计矢量',
    description: '品牌设计与矢量风格生图'
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
  // 禁止再改写成 ci.xiaohongshu.com/{fileId} —— 对 notes_pre_post 资源会稳定 404
  if (/xhscdn\.com|xiaohongshu\.com|ci\.xiaohongshu\.com/i.test(url)) {
    url = url.replace(/!nd_dft_[a-zA-Z0-9_]*$/i, '');
    url = url.replace(/![a-zA-Z0-9_\-\.]*$/i, '');
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
    url = url.replace(/![a-zA-Z0-9_\-\.]*$/i, '');
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
  url = url.replace(/\.(jpg|jpeg|png)![a-zA-Z0-9_\-\.]*$/i, '.$1');
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
  text = text.replace(/【(?:专属(?:真人)?模特(?:正脸)?图|Anchor\s*Face|正脸定型图|人脸定型图)】/gi, '@图片3');
  text = text.replace(/基于专属(?:真人)?模特(?:正脸)?图/g, '基于 @图片3');
  text = text.replace(/专属(?:真人)?模特(?:正脸)?图/g, '@图片3');
  text = text.replace(/【?图\s*1】?(?:中的)?(?:主商品|商品|实物)?/g, '@图片1');
  text = text.replace(/【?图\s*2】?(?:中的)?(?:构图|置景|场景)?/g, '@图片2');
  text = text.replace(/【?图\s*3】?(?:中的)?(?:正脸|人脸|模特)?/g, '@图片3');
  text = text.replace(/\b(?:from\s+Image\s*1|in\s+Image\s*1|of\s+Image\s*1)\b/gi, '@图片1');
  text = text.replace(/\b(?:from\s+Image\s*2|in\s+Image\s*2|of\s+Image\s*2)\b/gi, '@图片2');
  text = text.replace(/\b(?:from\s+Image\s*3|in\s+Image\s*3|of\s+Image\s*3)\b/gi, '@图片3');

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
 * 剥离工坊注入的守卫文案与尾部追加句（Hub/快速生图 plain 模式使用）
 */
export function stripWorkshopPromptGuards(prompt: string): string {
  if (!prompt) return prompt;
  const text = prompt
    .replace(/【(?:原创|爆款)[^】]*】[^【]*?。/g, ' ')
    .replace(/【身份硬锁定[^\]]*】[^【]*?。/g, ' ')
    .replace(/【表情解耦】[^【]*?。/g, ' ')
    .replace(/【解剖与物理硬约束】[^【]*?。/g, ' ')
    .replace(/商品外观以 @图片\s*1 为准[，,]?禁止用文字描写商品几何细节。?/g, ' ')
    .replace(/商品外观以 @图片\s*1 为准。?/g, ' ')
    .replace(/人物五官 ID 以 @图片\s*2 为准。?/g, ' ')
    .replace(/人物五官 ID 仅以 @图片\s*3 定型。?/g, ' ')
    .replace(/构图机位与肢体姿势以 @图片\s*2 为准[^。]*。?/g, ' ')
    .replace(/场景空间以 @图片\s*[23] 定桩[^。]*。?/g, ' ')
    .replace(/表情关键词：[^。]+。?/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

/** Hub 快速生图：精简负向词，避免电商工坊长列表污染创意请求 */
export function getPlainNegativePrompt(): string {
  return 'blurry, low resolution, watermark, text overlay, ugly, distorted, deformed, bad anatomy, extra limbs';
}

/**
 * 动静分离的动态负向提示词引擎
 * 根据分镜是否有模特/手部出镜，精准分配排斥规则，彻底排斥鼠标指针与截屏UI工件
 */
export function getDynamicNegativePrompt(options?: {
  hasHuman?: boolean;
  shotType?: string;
  socialMode?: boolean;
  plainMode?: boolean;
}): string {
  if (options?.plainMode) {
    return getPlainNegativePrompt();
  }
  const hasHuman = options?.hasHuman !== false && options?.shotType !== 'pure_product';
  const socialLeak = options?.socialMode
    ? ', competitor product body, wrong camera bump layout, old phone model, brand logo mismatch, packaging box of other SKU, sticker watermark from reference, influencer face identity from reference shot, original model face from composition reference, wrong person identity, random face, different person, face of girl in reference photo, keep original face, same face as image 2, copy face from pose reference, identity from composition image, fused face, morph face, hybrid identity, copied expression from identity reference, copied expression from composition reference, same facial expression as pose reference, mirrored social media face expression, wink from face plate, pout from face plate, forced wink, forced kiss pout, identity-photo expression, passport-photo expression, blurred face patch, mosaic face, pixelated head, censored face, face covered by blur rectangle, gaussian blur over face'
    : '';

  // 🌟 截屏工件与鼠标光标通用排斥词 (防止采集自社交媒体截屏图中的系统UI/鼠标元素被生图模型复刻)
  const screenshotArtifacts = 'cursor, mouse cursor, mouse pointer, arrow cursor, hand cursor, pointer icon, UI overlay, screenshot artifact, browser chrome, browser toolbar, address bar, taskbar, desktop icons, system tray, window controls, minimize button, close button, scrollbar, notification popup';

  const physicsArtifacts =
    ', extra legs, three legs, fused limbs, disconnected limbs, floating objects, defying gravity, object hovering, spoon in mouth, invented props not in reference';

  if (!hasHuman) {
    // 纯静物 / 商业实物特写专属负向词 (精准排斥鼠标光标、商业海报广告文案、参数列表、粗劣 3D 渲染、假塑料反光、暗室死黑)
    return `${screenshotArtifacts}, promotional poster, marketing banner, text overlay, typography, Chinese text watermark, spec icons, parameter table, commercial advertisement, billboard, graphic design poster, spec sheet, product brochure, extra arms, human limbs, extra hands, mutated fingers, human in background, floating object, anti-gravity, distorted geometry, malformed product, plastic fake reflection, cheap CGI, 3d render, blender render, unreal engine, clay material, fake specular highlights, cheesy retro racing game, fake neon speedometer, arcade car game, low quality 3d car dashboard, cheap synthwave grid, ugly neon gauges, fake glowing ui, blurry fake video game, blurry, low resolution, watermark, ugly text artifact, oversaturated, unrealistic perspective, dark gloomy lighting, muddy black shadows, cheap black plastic clutter, red greasy wood table, dirty messy desk, unlit dark room, low contrast murky colors, empty blank desk, flat sterile lighting, plastic toy look, washed out colors, harsh flat light${physicsArtifacts}${socialLeak}`;
  }

  // 真人模特 / 手持操作专属负向词 (排斥鼠标光标、商业海报文字、多手多臂、面具假脸、解剖学畸变与粗劣 3D)
  return `${screenshotArtifacts}, promotional poster, marketing banner, text overlay, typography, Chinese text watermark, spec icons, parameter table, commercial advertisement, billboard, extra arms, three arms, floating arms, third arm, extra hands, missing arms, duplicate limbs, bad hands, mutated fingers, bad anatomy, deformed limbs, floating hand holding phone, detached arms, deformed hands, distorted fingers, extra fingers, missing fingers, malformed camera bump, extra lenses, distorted phone body, plastic skin, fake face, mask face, double faces, over-smoothed skin, 3d render, cheap CGI, unreal engine, blender render, cheesy retro racing game, fake neon speedometer, mutated body parts, low quality, blurry, watermark, ugly, text artifact, dark gloomy lighting, muddy black shadows${physicsArtifacts}${socialLeak}`;
}

/**
 * 爆款复刻人物镜生图硬守卫：身份只认正脸板；构图图只供姿势机位
 */
export function buildSocialHumanGenGuard(options?: {
  hasFace?: boolean;
  hasHuman?: boolean;
  socialMode?: boolean;
}): string {
  if (!options?.socialMode) return '';
  const hasHuman = options.hasHuman === true;
  const anatomy =
    '【解剖与物理硬约束】严格仅两臂共10指、下肢仅两条腿，禁止第三只手/多余腿/融合肢体/悬浮肢体；道具必须有真实接触与重力落点，禁止悬空、禁止添加参考图中不存在的道具。';
  if (!hasHuman) {
    return `【爆款静物守卫】构图场景以 @图片2 为准，商品外观只认 @图片1；画面禁止人物出镜。${anatomy}`;
  }
  if (options.hasFace) {
    return (
      `【身份硬锁定·最高优先级】成图人物必须是 @图片3 同一真人：同一双眼间距、眼型、鼻梁、唇形、下颌与肤质纹理。` +
      `严禁抄袭、融合或脑补 @图片2 中的原模特五官；@图片2 人脸区域已破坏身份，只能读取身体姿势、手势、服装动态、相机机位与场景布局。` +
      `头部朝向与嘴部开合程度可参考 @图片2，但眉眼鼻唇骨相 100% 只认 @图片3。` +
      `@图片2 与 @图片3 均不可作表情源：眉眼笑意/嘟嘴/眨眼等神态只认提示词中的表情关键词。` +
      `禁止输出模糊脸、马赛克脸、矩形遮挡脸。商品外观只认 @图片1。${anatomy}`
    );
  }
  return `【爆款人物守卫】肢体动作与机位以 @图片2 为准；商品外观只认 @图片1。禁止大块模糊脸/马赛克遮挡。${anatomy}`;
}

/**
 * 爆款复刻：人物+正脸时强制刷新身份锁定句，避免历史弱提示词继续诱导抄 @图片2 原脸
 */
export function ensureSocialPromptSlots(
  prompt: string,
  options?: { hasHuman?: boolean; hasFace?: boolean; socialMode?: boolean; expression?: string }
): string {
  if (!options?.socialMode || !prompt) return prompt;
  let text = prompt;
  const hasFace = Boolean(options.hasFace);
  const hasHuman = options.hasHuman === true;

  // 去掉旧版弱守卫 / 表情解耦，统一换成强身份锁定
  text = text
    .replace(/【爆款人物守卫】[^【]*/g, ' ')
    .replace(/【爆款静物守卫】[^【]*/g, ' ')
    .replace(/【身份硬锁定[^\]]*】[^【]*/g, ' ')
    .replace(/【表情解耦】[^【]*/g, ' ')
    .replace(/【解剖与物理硬约束】[^【]*/g, ' ');

  const guard = buildSocialHumanGenGuard({
    hasFace,
    hasHuman,
    socialMode: true,
  });
  if (guard) {
    text = `${guard} ${text}`;
  }

  if (!/@图片\s*1/.test(text)) {
    text = `${text} 商品外观以 @图片1 为准。`;
  }
  if (!/@图片\s*2/.test(text)) {
    text = `${text} 构图机位与肢体姿势以 @图片2 为准（忽略其五官身份与整脸表情）。`;
  }
  if (hasHuman && hasFace && !/@图片\s*3/.test(text)) {
    text = `${text} 人物五官 ID 仅以 @图片3 定型。`;
  }
  if (hasHuman && hasFace) {
    text =
      `${text} 【表情解耦】只迁移 @图片2 的头朝向与嘴开合；眉眼笑意/嘟嘴/眨眼等神态只认提示词表情关键词，严禁来自 @图片2 或 @图片3；眉眼鼻唇骨相必须来自 @图片3；禁止输出模糊脸块或马赛克遮挡。`;
  }

  const expression = (options.expression || '').trim();
  if (
    hasHuman &&
    expression &&
    expression !== '无（静物）' &&
    !/表情关键词\s*[:：]/.test(text)
  ) {
    text = `${text} 表情关键词：${expression}。`;
  }

  return text.replace(/\s+/g, ' ').trim();
}

/** 原创组内差异库：按 shot_no 预分配，保证表情/动作/机位两两不同 */
export const ORIGINAL_DIVERSITY_POOL = {
  expressions: [
    '浅笑望向镜头外，眼神放松',
    '微蹙眉专注看向手中物，口型自然闭合',
    '半侧脸轻抿唇，若有所思',
    '开怀短笑露出牙齿，眼神明亮',
    '平静直视前方，唇角几乎不动',
    '抬头望向远处光源，表情清爽',
  ],
  actions: [
    '双手自然垂落身侧，微微前倾站立',
    '一手轻托商品靠近胸口展示',
    '侧身靠墙，一手插口袋一手持物',
    '坐姿交叠小腿，双手捧物置于膝上',
    '行走中回眸，一手自然摆动',
    '俯身整理桌面道具，另一手扶商品',
  ],
  cameras: [
    { focal: '35mm 人文全景', angle: '平视全景定场' },
    { focal: '50mm 标准', angle: '45° 斜侧中景' },
    { focal: '85mm 人像', angle: '微俯中近景' },
    { focal: '28mm 广角', angle: '低机位仰拍纵深' },
    { focal: '70mm 半身', angle: '平视半身特写' },
    { focal: '40mm 生活', angle: '侧视过肩生活感' },
  ],
} as const;

export function getOriginalDiversityForShot(shotNo: number) {
  const i = Math.max(0, (shotNo || 1) - 1);
  const { expressions, actions, cameras } = ORIGINAL_DIVERSITY_POOL;
  return {
    expression: expressions[i % expressions.length],
    action: actions[i % actions.length],
    camera_focal_length: cameras[i % cameras.length].focal,
    angle: cameras[i % cameras.length].angle,
  };
}

/** 粗粒度文本相似度：重合字越多越雷同 */
export function isOriginalTextTooSimilar(a?: string, b?: string): boolean {
  const na = (a || '').replace(/\s+/g, '').trim();
  const nb = (b || '').replace(/\s+/g, '').trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length < 4) return false;
  let hits = 0;
  const step = Math.max(2, Math.floor(shorter.length / 4));
  for (let i = 0; i <= shorter.length - 3; i += step) {
    if (longer.includes(shorter.slice(i, i + 3))) hits += 1;
  }
  return hits >= 3;
}

/** 原创商品在画面中的角色：决定 Look 如何引用 @图片1，避免文字穿搭压过垫图 */
export type OriginalProductRole =
  | 'worn_apparel'
  | 'worn_accessory'
  | 'held_object'
  | 'placed_object';

export const ORIGINAL_PRODUCT_ROLES: OriginalProductRole[] = [
  'worn_apparel',
  'worn_accessory',
  'held_object',
  'placed_object',
];

export function normalizeOriginalProductRole(
  raw?: string | null,
  fingerprint?: string | null
): OriginalProductRole {
  const v = (raw || '').trim().toLowerCase();
  if (ORIGINAL_PRODUCT_ROLES.includes(v as OriginalProductRole)) {
    return v as OriginalProductRole;
  }
  const fp = `${raw || ''} ${fingerprint || ''}`.toLowerCase();
  if (
    /服饰|服装|上衣|衬衫|衬衣|外套|大衣|风衣|卫衣|毛衣|针织|裙|裤|牛仔|t\s*恤|tee|hoodie|jacket|coat|dress|apparel|fashion/.test(
      fp
    )
  ) {
    return 'worn_apparel';
  }
  if (
    /项链|手链|耳环|耳钉|戒指|手表|腕表|围巾|帽子|包|腰带|鞋|靴|饰品|配饰|jewelry|necklace|earring|bag|shoes/.test(
      fp
    )
  ) {
    return 'worn_accessory';
  }
  if (/静物|陈设|摆拍|桌面|placed/.test(fp)) {
    return 'placed_object';
  }
  return 'held_object';
}

export interface OriginalLookParts {
  top?: string;
  bottom?: string;
  shoes?: string;
  accessory?: string;
  /** 合并摘要（兼容旧 look_bible 字符串） */
  summary?: string;
}

export interface OriginalGroupBible {
  identityBible?: string;
  lookBible?: string;
  lookParts?: OriginalLookParts;
  masterScene?: string;
  styleBible?: string;
  /** 商品角色：穿在身上 / 佩戴 / 手持 / 静物 */
  productRole?: OriginalProductRole;
  /** 商品指纹摘要，注入守卫辅助跟品 */
  productFingerprint?: string;
}

export interface OriginalShotFields {
  shot_no?: number;
  expression?: string;
  action?: string;
  prop?: string;
  camera_focal_length?: string;
  angle?: string;
  optics?: string;
  lighting_type?: string;
  scene?: string;
  title?: string;
  has_human?: boolean;
  /** 模型原文，仅作 fallback */
  promptFallback?: string;
}

/** 服饰/配饰商品：清洗自造颜色款式，强制用 @图片1 槽位话术 */
export function sanitizeLookPartsForProductRole(
  parts: OriginalLookParts | null | undefined,
  lookBible: string | undefined,
  role: OriginalProductRole
): OriginalLookParts {
  const summary = (lookBible || parts?.summary || '').trim();
  let top = (parts?.top || '').trim();
  let bottom = (parts?.bottom || '').trim();
  let shoes = (parts?.shoes || '').trim();
  let accessory = (parts?.accessory || '').trim();

  if ((!top || !bottom) && summary) {
    const segs = summary
      .split(/[·;；|/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segs.length >= 4) {
      top = top || segs[0];
      bottom = bottom || segs[1];
      shoes = shoes || segs[2];
      accessory = accessory || segs[3];
    } else if (segs.length === 1) {
      top = top || summary;
    }
  }

  const stripInventedGarment = (s: string) => {
    if (!s) return s;
    if (/@图片\s*1/.test(s)) return s;
    // 去掉易压过垫图的自造颜色/款式描写，保留「下装/鞋履」等非商品位时可再写
    return s
      .replace(
        /(白色|黑色|蓝色|红色|粉色|米色|灰色|绿色|黄色|棕色|卡其|藏青|奶白)?\s*(T恤|t恤|tee|衬衫|衬衣|外套|卫衣|毛衣|针织衫|连衣裙|半身裙|牛仔裤|阔腿裤)/gi,
        ''
      )
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  if (role === 'worn_apparel') {
    top = '穿着 @图片1 所示服装（外观颜色款式材质一律以 @图片1 为准，禁止用文字另写颜色或版型）';
    bottom = bottom
      ? stripInventedGarment(bottom) || '与 @图片1 服装协调的简洁下装（勿抢主体）'
      : '与 @图片1 服装协调的简洁下装（勿抢主体）';
    shoes = shoes || '简约鞋履';
    accessory = accessory && !/脖子佩戴|项链/.test(accessory)
      ? accessory
      : '无抢镜配饰';
    return {
      top,
      bottom,
      shoes,
      accessory,
      summary: `上装=@图片1 所示服装·${bottom}·${shoes}·${accessory}`,
    };
  }

  if (role === 'worn_accessory') {
    const acc =
      accessory && /@图片\s*1/.test(accessory)
        ? accessory
        : '佩戴/使用 @图片1 所示商品（外观以 @图片1 为准，禁止文字描写几何细节）';
    top = top || '与商品调性匹配的简洁上装';
    bottom = bottom || '干净利落的下装';
    shoes = shoes || '简约鞋履';
    return {
      top,
      bottom,
      shoes,
      accessory: acc,
      summary: summary || `${top}·${bottom}·${shoes}·${acc}`,
    };
  }

  if (role === 'placed_object') {
    return {
      top: '',
      bottom: '',
      shoes: '',
      accessory: '',
      summary: summary || '商品陈设以 @图片1 为准',
    };
  }

  // held_object：服饰可自拟，但禁止把商品写成脖子佩戴；商品仅 @图片1
  if (accessory && /脖子佩戴|项链/.test(accessory) && !/@图片\s*1/.test(accessory)) {
    accessory = '无抢镜配饰';
  }
  return {
    top: top || '与商品调性匹配的简洁上装',
    bottom: bottom || '干净利落的下装',
    shoes: shoes || '简约鞋履',
    accessory: accessory || '无抢镜配饰',
    summary:
      summary ||
      `${top || '简洁上装'}·${bottom || '简洁下装'}·${shoes || '简约鞋履'}·手持 @图片1 所示商品`,
  };
}

function joinLookSummary(
  parts?: OriginalLookParts,
  lookBible?: string,
  role: OriginalProductRole = 'held_object'
): {
  top: string;
  bottom: string;
  shoes: string;
  accessory: string;
  summary: string;
} {
  const sanitized = sanitizeLookPartsForProductRole(parts, lookBible, role);
  return {
    top: sanitized.top || '',
    bottom: sanitized.bottom || '',
    shoes: sanitized.shoes || '',
    accessory: sanitized.accessory || '',
    summary: sanitized.summary || '',
  };
}

/**
 * 生图前冲突清洗：去掉易压过 @图片1 的自造服饰颜色句，并强制补商品槽声明
 * 注意：不处理【…守卫】块，避免误伤 productFingerprint（如「蓝色牛津衬衫」）
 */
export function scrubOriginalPromptProductConflicts(
  prompt: string,
  role: OriginalProductRole
): string {
  if (!prompt) return prompt;
  // 拆出守卫块，只清洗正文
  const guards: string[] = [];
  let text = prompt.replace(/【[^】]+】[^【]*/g, (m) => {
    guards.push(m.trim());
    return ' ';
  });
  if (role === 'worn_apparel') {
    text = text.replace(
      /(?![^；;]*@图片\s*1)[^；;]*(白色|黑色|蓝色|红色|粉色|米色|灰色)[^；;]*(T恤|t恤|衬衫|衬衣|外套|卫衣|毛衣)[^；;]*/gi,
      '穿着 @图片1 所示服装'
    );
  }
  if (!/@图片\s*1/.test(`${guards.join(' ')} ${text}`)) {
    text = `${text} 商品外观以 @图片1 为准，禁止用文字描写商品几何与颜色细节。`;
  }
  return `${guards.join(' ')} ${text}`.replace(/\s+/g, ' ').trim();
}

/**
 * 确定性拼装原创分镜 Prompt（8 段骨架 + 镜级差异），再注入守卫。
 * 分析后与「组级锁定写回」必须共用此函数，避免 LLM 正文漂移。
 */
export function assembleOriginalShotPrompt(
  bible: OriginalGroupBible,
  shot: OriginalShotFields,
  options?: { hasFace?: boolean; hasSceneAnchor?: boolean }
): string {
  const hasHuman = shot.has_human !== false;
  const hasFace = Boolean(options?.hasFace) && hasHuman;
  const shotNo = shot.shot_no || 1;
  const diversity = getOriginalDiversityForShot(shotNo);
  const productRole = normalizeOriginalProductRole(
    bible.productRole,
    bible.productFingerprint
  );

  const expression =
    (shot.expression || '').trim() || (hasHuman ? diversity.expression : '无（静物）');
  const action = (shot.action || '').trim() || diversity.action;
  const camera =
    (shot.camera_focal_length || '').trim() || diversity.camera_focal_length;
  const angle = (shot.angle || '').trim() || diversity.angle;
  const lighting =
    (shot.lighting_type || '').trim() ||
    (bible.styleBible || '').trim() ||
    '自然窗光，通透真实';
  const optics =
    (shot.optics || '').trim() ||
    `${camera}，${angle}，8K 高清，极度真实写实，皮肤质感清晰`;
  let prop =
    (shot.prop || '').trim() ||
    (hasHuman ? '手持或轻触与场景匹配的生活道具' : '商品陈设与场景道具');
  if (productRole === 'held_object' && hasHuman && !/@图片\s*1/.test(prop)) {
    prop = `手持或展示 @图片1 所示商品；${prop}`;
  }
  if (productRole === 'worn_apparel' && hasHuman) {
    // 服饰商品不是手持道具
    if (/手持.*商品|轻托商品/.test(prop) && !/@图片\s*1/.test(prop)) {
      prop = '自然生活道具互动（勿用手遮挡 @图片1 服装主体）';
    }
  }

  const look = joinLookSummary(bible.lookParts, bible.lookBible, productRole);
  const masterScene = (bible.masterScene || shot.scene || '').trim() || '干净有质感的真实生活空间';
  const sceneSeg = (shot.scene || '').trim().includes(masterScene.slice(0, Math.min(8, masterScene.length)))
    ? (shot.scene || masterScene).trim()
    : `${masterScene}，本镜机位：${angle}`;

  const identity =
    (bible.identityBible || '').trim() ||
    (hasFace
      ? '年轻东亚模特，五官 ID 以 @图片2 为准'
      : '年轻东亚模特，清透自然面容');

  const styleSeg =
    (bible.styleBible || '').trim() ||
    `${lighting}，时尚博主精致感，8K 高清，极度真实写实，毫无 AI 感`;

  let body: string;
  if (!hasHuman || productRole === 'placed_object') {
    body = [
      `真实买家秀静物实拍，主体为 @图片1`,
      look.summary || '商品陈设以 @图片1 为准',
      prop,
      sceneSeg,
      styleSeg,
    ].join('；');
    body = `${body}。动作：${action}；光学：${optics}`;
  } else {
    const subject = hasFace
      ? `${identity}（五官 @图片2）`
      : identity;
    const lookSegs =
      productRole === 'worn_apparel'
        ? [look.top, look.bottom, look.shoes, look.accessory].filter(Boolean)
        : productRole === 'worn_accessory'
          ? [
              look.top,
              look.bottom,
              look.shoes,
              look.accessory.includes('@图片1')
                ? look.accessory
                : `${look.accessory}（商品外观 @图片1）`,
            ]
          : [
              look.top,
              look.bottom,
              look.shoes,
              look.accessory,
              '商品外观仅以 @图片1 为准，禁止文字描写商品几何与颜色',
            ];
    body = [subject, ...lookSegs, prop, sceneSeg, styleSeg].join('；');
    body = `${body}。表情：${expression}；动作：${action}；光学：${optics}`;
  }

  // fallback：若组级圣经几乎为空且有模型原文，保留原文骨架再守卫
  if (
    !bible.identityBible &&
    !bible.lookBible &&
    !bible.masterScene &&
    shot.promptFallback?.trim()
  ) {
    body = shot.promptFallback.trim();
  }

  body = scrubOriginalPromptProductConflicts(body, productRole);

  return ensureOriginalPromptSlots(body, {
    hasHuman: hasHuman && productRole !== 'placed_object',
    hasFace,
    masterScene: bible.masterScene || masterScene,
    identityBible: bible.identityBible || identity,
    lookBible: look.summary,
    hasSceneAnchor: options?.hasSceneAnchor,
    productRole,
    productFingerprint: bible.productFingerprint,
  });
}

/**
 * 对一组镜级字段做差异补齐：过近则用差异库改写
 */
export function enforceOriginalShotDiversity<T extends OriginalShotFields>(
  shots: T[],
  hasHuman = true
): T[] {
  const usedExpr: string[] = [];
  const usedAction: string[] = [];
  return shots.map((shot, idx) => {
    const shotNo = shot.shot_no || idx + 1;
    const pool = getOriginalDiversityForShot(shotNo);
    let expression = (shot.expression || '').trim();
    let action = (shot.action || '').trim();
    let camera = (shot.camera_focal_length || '').trim();
    let angle = (shot.angle || '').trim();

    if (hasHuman && shot.has_human !== false) {
      if (!expression || usedExpr.some((e) => isOriginalTextTooSimilar(e, expression))) {
        expression = pool.expression;
      }
      if (!action || usedAction.some((a) => isOriginalTextTooSimilar(a, action))) {
        action = pool.action;
      }
      usedExpr.push(expression);
      usedAction.push(action);
    } else {
      if (!action || usedAction.some((a) => isOriginalTextTooSimilar(a, action))) {
        action = pool.action;
      }
      usedAction.push(action);
    }

    if (!camera) camera = pool.camera_focal_length;
    if (!angle) angle = pool.angle;

    return {
      ...shot,
      shot_no: shotNo,
      expression: hasHuman && shot.has_human !== false ? expression : shot.expression || '无（静物）',
      action,
      camera_focal_length: camera,
      angle,
    };
  });
}

/**
 * 原创种草：注入 Identity / Scene / Look 短守卫（非爆款「姿态跟图2 / 表情跟文字」话术）
 * 垫图约定：@图片1=商品；有人物+正脸时 @图片2=正脸 ID；shot≥2 场景定桩为 @图片3
 */
export function ensureOriginalPromptSlots(
  prompt: string,
  options?: {
    hasHuman?: boolean;
    hasFace?: boolean;
    masterScene?: string;
    identityBible?: string;
    lookBible?: string;
    hasSceneAnchor?: boolean;
    productRole?: OriginalProductRole;
    productFingerprint?: string;
  }
): string {
  if (!prompt) return prompt;
  let text = prompt
    .replace(/【原创身份守卫】[^【]*/g, ' ')
    .replace(/【原创场景守卫】[^【]*/g, ' ')
    .replace(/【原创穿搭守卫】[^【]*/g, ' ')
    .replace(/【原创差异守卫】[^【]*/g, ' ')
    .replace(/【原创定桩守卫】[^【]*/g, ' ')
    .replace(/【原创跟品守卫】[^【]*/g, ' ');

  const guards: string[] = [];
  const hasHuman = options?.hasHuman === true;
  const hasFace = Boolean(options?.hasFace);
  const role = normalizeOriginalProductRole(options?.productRole, options?.productFingerprint);

  if (hasHuman) {
    if (hasFace) {
      guards.push(
        '【原创身份守卫】全套同一人物身份；五官 ID 以 @图片2 正脸特写板为准，严禁换人、换发型主色或照搬正脸板背景与死板表情。'
      );
    } else if (options?.identityBible) {
      guards.push(`【原创身份守卫】全套同一人物：${options.identityBible}；严禁中途换人。`);
    } else {
      guards.push('【原创身份守卫】全套同一人物身份，严禁中途换人。');
    }
  }

  if (options?.masterScene?.trim()) {
    guards.push(
      `【原创场景守卫】全套锁定同一主空间：${options.masterScene.trim()}；本镜仅换机位/景别，禁止换房换色温。`
    );
  }

  if (role === 'worn_apparel') {
    guards.push(
      '【原创穿搭守卫】模特必须穿着 @图片1 所示服装；上装/主体服饰的颜色、版型、材质一律以 @图片1 像素为准；忽略提示词中任何自造颜色或款式文字；禁止换成白T或其他无关上衣。'
    );
  } else if (role === 'worn_accessory') {
    guards.push(
      '【原创穿搭守卫】必须清晰佩戴/展示 @图片1 所示配饰商品；外观只认 @图片1；其余服饰可协调但不得抢镜或改写商品外观。'
    );
  } else if (options?.lookBible?.trim()) {
    guards.push(
      `【原创穿搭守卫】服饰配饰锁定：${options.lookBible.trim()}；商品外观只认 @图片1，禁止用文字改写商品颜色与几何。`
    );
  }

  const fp = (options?.productFingerprint || '').trim();
  if (fp) {
    guards.push(`【原创跟品守卫】商品识别：${fp}；画面主体外观必须与 @图片1 一致。`);
  } else {
    guards.push('【原创跟品守卫】商品外观唯一真相是 @图片1，禁止文字描写商品几何与颜色细节。');
  }

  guards.push(
    '【原创差异守卫】本镜表情、动作、道具互动与机位须与同组其他镜明显不同；禁止复制粘贴句式。'
  );

  if (options?.hasSceneAnchor) {
    const sceneSlot = hasFace ? '@图片3' : '@图片2';
    guards.push(
      `【原创定桩守卫】${sceneSlot} 仅作空间/背景/光色参考；必须忽略其中人物表情、姿势、构图裁切与五官，本镜表情与动作以正文为准。`
    );
  }

  if (!/@图片\s*1/.test(text)) {
    text = `${text} 商品外观以 @图片1 为准，禁止用文字描写商品几何细节。`;
  }
  if (hasHuman && hasFace && !/@图片\s*2/.test(text)) {
    text = `${text} 人物五官 ID 以 @图片2 为准。`;
  }
  if (options?.hasSceneAnchor) {
    const sceneSlot = hasFace ? '@图片3' : '@图片2';
    if (!new RegExp(sceneSlot.replace('@', '@\\s*')).test(text) && !text.includes(sceneSlot)) {
      text = `${text} 场景空间以 ${sceneSlot} 定桩（忽略其人物表情与姿势）。`;
    }
  }

  return scrubOriginalPromptProductConflicts(
    `${guards.join(' ')} ${text}`.replace(/\s+/g, ' ').trim(),
    role
  );
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
  socialMode?: boolean;
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

  const cleanedPrompt = params.plainMode
    ? cleanPromptText(params.prompt)
    : ensureSocialPromptSlots(cleanPromptText(params.prompt), {
        hasHuman: params.hasHuman,
        hasFace: params.hasFace,
        socialMode: params.socialMode,
      });
  const dynamicNegative = getDynamicNegativePrompt({
    hasHuman: params.plainMode ? false : params.hasHuman,
    shotType: params.plainMode ? 'pure_product' : params.shotType,
    socialMode: params.socialMode,
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
 * 统一友好的模型名称格式化工具
 */
export function formatDisplayModel(model?: string, isVideo?: boolean): string {
  if (!model) return isVideo ? '即梦 Seedance' : 'GPT Image 2';
  const m = model.toLowerCase().trim();
  const builtin = IMAGE_GEN_MODELS.find((x) => x.id.toLowerCase() === m);
  if (builtin) return builtin.shortName;
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
  if (m.includes('gpt-image-2-4k') || m.includes('image2-4k')) return 'GPT Image 2 4K';
  if (m.includes('gpt-image-2') || m.includes('gpt-image')) return 'GPT Image 2';
  if (m.includes('flux')) return 'FLUX';
  if (m.includes('recraft')) return 'Recraft V3';
  if (m.includes('midjourney') || m.includes('mj')) return 'Midjourney';
  if (m.includes('seedream')) return 'Seedream 5.0';
  if (m.includes('grok')) return 'Grok 4.1';
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


