import { getApprovedModel } from './modelCatalog';

/**
 * 厂商权威度与展示优先级清单
 */
export const VENDOR_PRIORITY: readonly string[] = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'deepseek',
  'bytedance',
  'alibaba',
  'minimax',
  'zhipu',
  'kuaishou',
  'moonshot',
  'flux',
  'midjourney',
  'vidu',
  'meta',
  'xiaomi',
  'yi',
  'baidu',
  'stepfun',
  'baichuan',
  'sensenova',
  'mistral',
  'luma',
  'runway',
  'pika',
  'recraft',
  'tripo',
  'suno',
  'elevenlabs',
  'topaz',
  'other',
];

const VENDOR_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  bytedance: '字节跳动',
  alibaba: '通义千问',
  minimax: 'MiniMax',
  zhipu: '智谱 AI',
  kuaishou: '快手可灵',
  moonshot: '月之暗面',
  flux: 'Flux',
  midjourney: 'Midjourney',
  vidu: '生数科技',
  meta: 'Meta',
  xiaomi: '小米',
  yi: '零一万物',
  baidu: '百度文心',
  stepfun: '阶跃星辰',
  baichuan: '百川智能',
  sensenova: '商汤科技',
  mistral: 'Mistral',
  luma: 'Luma',
  runway: 'Runway',
  pika: 'Pika',
  recraft: 'Recraft',
  hunyuan: '腾讯混元',
  stability: 'Stability',
  tripo: 'Tripo',
  meshy: 'Meshy',
  suno: 'Suno',
  elevenlabs: 'ElevenLabs',
  topaz: 'Topaz',
  other: '其他厂商',
};

const VENDOR_KEYWORD_RULES: Array<{ id: string; keywords: string[] }> = [
  { id: 'openai', keywords: ['gpt', 'openai', 'chatgpt', 'dall', 'sora', 'o1', 'o3', 'o4'] },
  { id: 'anthropic', keywords: ['claude', 'anthropic'] },
  { id: 'google', keywords: ['gemini', 'gemma', 'google', 'imagen', 'palm', 'veo', 'banana', 'omni_flash'] },
  { id: 'xai', keywords: ['grok', 'xai'] },
  { id: 'deepseek', keywords: ['deepseek'] },
  { id: 'bytedance', keywords: ['doubao', 'jimeng', 'bytedance', 'volc', 'skylark', 'seedream', 'seedance'] },
  { id: 'alibaba', keywords: ['qwen', 'tongyi', 'cosyvoice', 'wanx', 'wan', 'z-image', 'dashscope', 'alibaba'] },
  { id: 'flux', keywords: ['flux', 'bfl', 'black forest'] },
  { id: 'moonshot', keywords: ['moonshot', 'kimi'] },
  { id: 'minimax', keywords: ['minimax', 'abab', 'hailuo', 'speech-0', 'music-0'] },
  { id: 'zhipu', keywords: ['glm', 'zhipu', 'chatglm', 'cogview', 'cogvideo'] },
  { id: 'kuaishou', keywords: ['kling', 'kolors', 'keling', 'kuaishou'] },
  { id: 'midjourney', keywords: ['midjourney', 'niji', 'mj'] },
  { id: 'vidu', keywords: ['vidu', 'shengshu'] },
  { id: 'meta', keywords: ['llama', 'meta'] },
  { id: 'xiaomi', keywords: ['xiaomi', 'mimo'] },
  { id: 'yi', keywords: ['yi-', 'yi_', '01.ai', '01ai', '01-ai', 'yi-lightning', 'yi-large'] },
  { id: 'baidu', keywords: ['ernie', 'baidu', 'wenxin', '文心'] },
  { id: 'baichuan', keywords: ['baichuan', '百川'] },
  { id: 'stepfun', keywords: ['stepfun', 'step-', 'step_'] },
  { id: 'sensenova', keywords: ['sensenova', 'sensechat', 'internlm', 'internvl', '商汤'] },
  { id: 'mistral', keywords: ['mistral', 'pixtral', 'codestral', 'mixtral'] },
  { id: 'hunyuan', keywords: ['hunyuan', 'tencent'] },
  { id: 'luma', keywords: ['luma', 'dream-machine'] },
  { id: 'runway', keywords: ['runway', 'gen-2', 'gen-3', 'gen2', 'gen3'] },
  { id: 'pika', keywords: ['pika'] },
  { id: 'recraft', keywords: ['recraft'] },
  { id: 'stability', keywords: ['stability', 'stable-diffusion', 'sdxl', 'sd-3', 'stable-audio'] },
  { id: 'tripo', keywords: ['tripo'] },
  { id: 'meshy', keywords: ['meshy'] },
  { id: 'suno', keywords: ['suno', 'chirp'] },
  { id: 'elevenlabs', keywords: ['elevenlabs', 'eleven'] },
  { id: 'topaz', keywords: ['topaz', 'upscale'] },
];

const VENDOR_ALIASES: Record<string, string> = {
  kling: 'kuaishou',
  qwen: 'alibaba',
  doubao: 'bytedance',
  jimeng: 'bytedance',
  bfl: 'flux',
  shengshu: 'vidu',
  kimi: 'moonshot',
  glm: 'zhipu',
  chatglm: 'zhipu',
};

export function normalizeVendorId(vendor: string): string {
  const trimmed = vendor.trim().toLowerCase();
  return VENDOR_ALIASES[trimmed] || trimmed;
}

export function getVendorDisplayName(vendorId: string): string {
  const norm = normalizeVendorId(vendorId);
  return VENDOR_DISPLAY_NAMES[norm] || norm.charAt(0).toUpperCase() + norm.slice(1);
}

/**
 * 根据模型标识符及可选的提供商提示推断其归属厂商
 */
export function inferVendorId(modelId: string, providerHint?: string): string {
  const trimmedId = String(modelId || '').trim();
  if (!trimmedId) return 'other';

  // 1. 优先查官方批准模型目录
  const approved = getApprovedModel(trimmedId);
  if (approved?.vendor) {
    return normalizeVendorId(approved.vendor);
  }

  const cleanId = trimmedId.replace(/^(?:net-|fal-ai\/|openai\/)/i, '');
  const haystack = `${providerHint || ''} ${cleanId}`.toLowerCase();

  // 2. 匹配关键字
  let bestVendor = 'other';
  let bestLength = 0;
  for (const rule of VENDOR_KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw) && kw.length > bestLength) {
        bestVendor = rule.id;
        bestLength = kw.length;
      }
    }
  }

  return bestVendor;
}

const TIER_WEIGHTS: Record<string, number> = {
  sol: 100,
  opus: 98,
  luna: 95,
  sonnet: 92,
  astra: 88,
  pro: 86,
  max: 84,
  ultra: 82,
  terra: 80,
  haiku: 78,
  flash: 76,
  mini: 65,
  nano: 50,
  default: 70,
};

/**
 * 解析模型版本与规格评分，用于同厂商内部由高到低排序
 */
export function parseModelRankingScore(modelId: string): number {
  const lower = modelId.toLowerCase();

  // 1. 提取数值版本号（如 6, 5.6, 4.7, 3.8, 2.0 等）
  let versionNum = 1.0;
  const verMatch = lower.match(/(?:v|version|gpt-?|gemini-?|grok-?|claude-?|kling-?|seedance-?|flux-?)(\d+(?:\.\d+)?)/i);
  if (verMatch) {
    const val = parseFloat(verMatch[1]);
    if (!Number.isNaN(val)) {
      versionNum = val;
    }
  } else {
    // 尝试直接提取首个浮点数
    const numMatch = lower.match(/\b(\d+(?:\.\d+)?)\b/);
    if (numMatch) {
      const val = parseFloat(numMatch[1]);
      if (!Number.isNaN(val)) {
        versionNum = val;
      }
    }
  }

  // 2. 规格层级加权
  let tierWeight = TIER_WEIGHTS.default;
  for (const [tier, weight] of Object.entries(TIER_WEIGHTS)) {
    if (lower.includes(tier)) {
      tierWeight = Math.max(tierWeight, weight);
    }
  }

  return versionNum * 1000 + tierWeight;
}

export interface SortableModelItem {
  id: string;
  name?: string;
  provider?: string;
  isSmart?: boolean;
}

/**
 * 将模型列表按厂商权威度及同厂商内代际规格进行规整排序
 */
export function sortModelsByVendor<T extends SortableModelItem>(
  models: readonly T[],
): T[] {
  const result = [...models];

  result.sort((a, b) => {
    // 智能匹配模型置顶
    const aSmart = a.isSmart || a.id.startsWith('smart');
    const bSmart = b.isSmart || b.id.startsWith('smart');
    if (aSmart && !bSmart) return -1;
    if (!aSmart && bSmart) return 1;
    if (aSmart && bSmart) return 0;

    // 厂商优先级排序
    const aVendor = inferVendorId(a.id, a.provider);
    const bVendor = inferVendorId(b.id, b.provider);

    const aRank = VENDOR_PRIORITY.indexOf(aVendor);
    const bRank = VENDOR_PRIORITY.indexOf(bVendor);

    const effectiveARank = aRank >= 0 ? aRank : 999;
    const effectiveBRank = bRank >= 0 ? bRank : 999;

    if (effectiveARank !== effectiveBRank) {
      return effectiveARank - effectiveBRank;
    }

    // 同厂商内部按代际版本与规格降序排列
    const aScore = parseModelRankingScore(a.id);
    const bScore = parseModelRankingScore(b.id);

    if (bScore !== aScore) {
      return bScore - aScore;
    }

    return a.id.localeCompare(b.id);
  });

  return result;
}
