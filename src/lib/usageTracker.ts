// web-app/src/lib/usageTracker.ts
'use client';

/**
 * 🌟 算力与人民币标准折算汇率
 * 
 * 官方标准：1 算力额度 ($1.00 USD) ≈ 7.20 元人民币 (¥7.20 CNY)
 * 用户可在 localStorage 中自定义 quota_exchange_rate
 */
export function getQuotaToRmbRatio(): number {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('quota_exchange_rate');
    if (custom) {
      const val = parseFloat(custom);
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return 7.20; // 默认 1 算力 / $1.00 USD = ¥7.20 CNY
}

export const COMFLY_QUOTA_TO_RMB_RATIO = 7.20; // 1 算力 ($1 USD) = 7.20 元人民币 (¥7.20 CNY)

export interface ModelPricingRule {
  vendor: string;
  type: 'chat' | 'vision' | 'image' | 'video' | 'audio';
  promptPer1k?: number;      // 提示单价 ($ / 1K Tokens)
  completionPer1k?: number;  // 补全单价 ($ / 1K Tokens)
  fixedPerUnit?: number;     // 固定单价 ($ / 次 或 $ / 张)
  perSecPrice?: number;      // 视频按秒单价 ($ / 秒)
}

/**
 * Comfly 官方报价单模型单价映射字典 (全量收录官方主力模型)
 */
export const COMFY_MODEL_PRICING: Record<string, ModelPricingRule> = {
  // ===================== 1. Google Gemini 系列 =====================
  'gemini-3.7-flash': { vendor: 'Google', type: 'vision', promptPer1k: 0.0015, completionPer1k: 0.0075 },
  'gemini-3.7-flash-thinking': { vendor: 'Google', type: 'chat', promptPer1k: 0.0015, completionPer1k: 0.0075 },
  'gemini-3-flash-preview': { vendor: 'Google', type: 'vision', promptPer1k: 0.001, completionPer1k: 0.006 },
  'gemini-3.1-pro-preview': { vendor: 'Google', type: 'vision', promptPer1k: 0.004, completionPer1k: 0.024 },
  'gemini-3.1-pro-preview-thinking-high': { vendor: 'Google', type: 'chat', promptPer1k: 0.004, completionPer1k: 0.024 },
  'gemini-3-pro-preview': { vendor: 'Google', type: 'vision', promptPer1k: 0.004, completionPer1k: 0.024 },
  'gemini-2.5-pro': { vendor: 'Google', type: 'vision', promptPer1k: 0.0025, completionPer1k: 0.02 },
  'gemini-2.5-flash': { vendor: 'Google', type: 'vision', promptPer1k: 0.0006, completionPer1k: 0.005 },
  'gemini-2.5-flash-thinking': { vendor: 'Google', type: 'chat', promptPer1k: 0.0006, completionPer1k: 0.005 },
  'gemini-2.5-flash-lite': { vendor: 'Google', type: 'vision', promptPer1k: 0.0002, completionPer1k: 0.0008 },
  'gemini-3.1-flash-lite-preview': { vendor: 'Google', type: 'vision', promptPer1k: 0.0005, completionPer1k: 0.0015 },
  'gemini-3.5-flash': { vendor: 'Google', type: 'vision', promptPer1k: 0.003, completionPer1k: 0.015 },
  'gemini-3.6-flash': { vendor: 'Google', type: 'vision', promptPer1k: 0.003, completionPer1k: 0.015 },
  // Google 生图与视频
  'gemini-3.1-flash-image': { vendor: 'Google', type: 'image', fixedPerUnit: 0.20 },
  'gemini-3.1-flash-image-4k': { vendor: 'Google', type: 'image', fixedPerUnit: 0.274 },
  'gemini-2.5-flash-image': { vendor: 'Google', type: 'image', fixedPerUnit: 0.08 },
  'gemini-3-pro-image': { vendor: 'Google', type: 'image', fixedPerUnit: 0.40 },
  'gemini-3-pro-image-4k': { vendor: 'Google', type: 'image', fixedPerUnit: 0.55 },
  'imagen-3.0-generate-002': { vendor: 'Google', type: 'image', fixedPerUnit: 0.08 },
  'veo3.1-fast': { vendor: 'Google', type: 'video', fixedPerUnit: 1.20 },
  'veo3.1-pro-4k': { vendor: 'Google', type: 'video', fixedPerUnit: 13.00 },
  'veo3.1-pro': { vendor: 'Google', type: 'video', fixedPerUnit: 7.00 },
  'veo3': { vendor: 'Google', type: 'video', fixedPerUnit: 1.20 },
  'veo2': { vendor: 'Google', type: 'video', fixedPerUnit: 1.20 },

  // ===================== 2. Anthropic Claude 系列 =====================
  'claude-3-7-sonnet-20250219': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-3-7-sonnet-20250219-thinking': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-3-5-sonnet-20241022': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-3-5-sonnet-latest': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-3-5-haiku-20241022': { vendor: 'Anthropic', type: 'vision', promptPer1k: 0.001, completionPer1k: 0.005 },
  'claude-opus-5': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.005, completionPer1k: 0.025 },
  'claude-opus-5-thinking': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.005, completionPer1k: 0.025 },
  'claude-opus-4-7': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.005, completionPer1k: 0.025 },
  'claude-sonnet-4-6': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-sonnet-5': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.002, completionPer1k: 0.01 },
  'claude-fable-5': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.05, completionPer1k: 0.25 },

  // ===================== 3. OpenAI 系列 =====================
  'gpt-4o': { vendor: 'OpenAI', type: 'vision', promptPer1k: 0.0025, completionPer1k: 0.01 },
  'gpt-4o-2024-11-20': { vendor: 'OpenAI', type: 'vision', promptPer1k: 0.0025, completionPer1k: 0.01 },
  'gpt-4o-2024-08-06': { vendor: 'OpenAI', type: 'vision', promptPer1k: 0.0025, completionPer1k: 0.01 },
  'gpt-4o-mini': { vendor: 'OpenAI', type: 'vision', promptPer1k: 0.00015, completionPer1k: 0.0006 },
  'gpt-4o-mini-2024-07-18': { vendor: 'OpenAI', type: 'vision', promptPer1k: 0.00015, completionPer1k: 0.0006 },
  'o1': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.015, completionPer1k: 0.06 },
  'o1-2024-12-17': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.015, completionPer1k: 0.06 },
  'o1-mini': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.0011, completionPer1k: 0.0044 },
  'o3-mini': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.0011, completionPer1k: 0.0044 },
  'o3': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.002, completionPer1k: 0.008 },
  'o4-mini': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.0011, completionPer1k: 0.0044 },
  'gpt-5': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.00125, completionPer1k: 0.01 },
  'gpt-5-pro': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.015, completionPer1k: 0.12 },
  'gpt-5.5': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.005, completionPer1k: 0.04 },
  'gpt-5.5-pro': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.09, completionPer1k: 0.54 },
  'gpt-5.4': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.0025, completionPer1k: 0.015 },
  'gpt-5.4-mini': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.00075, completionPer1k: 0.0045 },
  'gpt-5.2': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.00175, completionPer1k: 0.014 },
  'gpt-5.1': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.00125, completionPer1k: 0.01 },
  // OpenAI 生图与视频
  'gpt-image-2': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.06 },
  'gpt-image-2-all': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.04 },
  'gpt-image-2-4k': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.08 },
  'image2-4k': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.08 },
  'gpt-image-1': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.06 },
  'gpt-image-1.5': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.06 },
  'dall-e-3': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.04 },
  'sora-2': { vendor: 'OpenAI', type: 'video', perSecPrice: 0.40 },
  'sora-2-pro': { vendor: 'OpenAI', type: 'video', perSecPrice: 1.20 },

  // ===================== 4. 字节跳动 (豆包 / 即梦) 系列 =====================
  'doubao-seedream-5-0-260128': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.15 },
  'doubao-seedream-4-5-251128': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.15 },
  'doubao-seedream-4-0-250828': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.14 },
  'doubao-seedream-3-0-t2i-250415': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.10 },
  'seedream-3.0': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.10 },
  'doubao-seededit-3-0-i2i-250628': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.15 },
  'seededit': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.10 },
  // 即梦 / 豆包视频
  'doubao-seedance-2.0-mini': { vendor: '字节即梦', type: 'video', perSecPrice: 0.50 },
  'doubao-seedance-2-0-260128': { vendor: '字节即梦', type: 'video', perSecPrice: 1.00 },
  'doubao-seedance-2-0-fast-260128': { vendor: '字节即梦', type: 'video', perSecPrice: 0.90 },
  // 豆包语言视觉
  'doubao-1.5-vision-pro': { vendor: '字节即梦', type: 'vision', promptPer1k: 0.0008, completionPer1k: 0.002 },
  'doubao-seed-2-0-pro-260215': { vendor: '字节即梦', type: 'chat', promptPer1k: 0.0032, completionPer1k: 0.016 },
  'doubao-seed-2-0-mini-260215': { vendor: '字节即梦', type: 'chat', promptPer1k: 0.0002, completionPer1k: 0.002 },

  // ===================== 5. 快手可灵 (Kling AI) 系列 =====================
  'kling-image': { vendor: '快手可灵', type: 'image', fixedPerUnit: 0.04 },
  'kling-image-v1': { vendor: '快手可灵', type: 'image', fixedPerUnit: 0.025 },
  'kling-image-v2': { vendor: '快手可灵', type: 'image', fixedPerUnit: 0.10 },
  'kling-image-v2-1': { vendor: '快手可灵', type: 'image', fixedPerUnit: 0.10 },
  'kling-kolors-virtual-try-on': { vendor: '快手可灵', type: 'image', fixedPerUnit: 0.48 },
  'kling-video': { vendor: '快手可灵', type: 'video', fixedPerUnit: 2.50 }, // 5s standard
  'kling-video-v1': { vendor: '快手可灵', type: 'video', fixedPerUnit: 1.00 },
  'kling-video-v1-5': { vendor: '快手可灵', type: 'video', fixedPerUnit: 2.00 },
  'kling-video-v1-6': { vendor: '快手可灵', type: 'video', fixedPerUnit: 2.00 },
  'kling-video-v2-1': { vendor: '快手可灵', type: 'video', fixedPerUnit: 2.00 },
  'kling-video-v2-6': { vendor: '快手可灵', type: 'video', fixedPerUnit: 2.50 },
  'kling-video-v2-master': { vendor: '快手可灵', type: 'video', fixedPerUnit: 10.00 },
  'kling-video-o1': { vendor: '快手可灵', type: 'video', fixedPerUnit: 0.80 },

  // ===================== 6. 阿里巴巴 (通义千问 / 万相 Wan) 系列 =====================
  'qwen-max': { vendor: '阿里百炼', type: 'chat', promptPer1k: 0.0024, completionPer1k: 0.0096 },
  'qwen-max-latest': { vendor: '阿里百炼', type: 'chat', promptPer1k: 0.0024, completionPer1k: 0.0096 },
  'qwen3-max': { vendor: '阿里百炼', type: 'chat', promptPer1k: 0.0025, completionPer1k: 0.025 },
  'qwen-plus': { vendor: '阿里百炼', type: 'chat', promptPer1k: 0.0008, completionPer1k: 0.002 },
  'qwen3.5-plus': { vendor: '阿里百炼', type: 'chat', promptPer1k: 0.0008, completionPer1k: 0.0048 },
  'qwen-turbo': { vendor: '阿里百炼', type: 'chat', promptPer1k: 0.0003, completionPer1k: 0.0006 },
  'qwen-flash': { vendor: '阿里百炼', type: 'chat', promptPer1k: 0.00014, completionPer1k: 0.0015 },
  'qwen2.5-vl-72b-instruct': { vendor: '阿里百炼', type: 'vision', promptPer1k: 0.003, completionPer1k: 0.012 },
  'qwen2.5-vl-7b-instruct': { vendor: '阿里百炼', type: 'vision', promptPer1k: 0.001, completionPer1k: 0.005 },
  'qwen-vl-max': { vendor: '阿里百炼', type: 'vision', promptPer1k: 0.0016, completionPer1k: 0.004 },
  'qwen-vl-plus': { vendor: '阿里百炼', type: 'vision', promptPer1k: 0.0008, completionPer1k: 0.002 },
  'qwen3-vl-plus': { vendor: '阿里百炼', type: 'vision', promptPer1k: 0.001, completionPer1k: 0.01 },
  // 万相生图与视频
  'qwen-image': { vendor: '阿里百炼', type: 'image', fixedPerUnit: 0.25 },
  'qwen-image-edit': { vendor: '阿里百炼', type: 'image', fixedPerUnit: 0.30 },
  'qwen-image-max': { vendor: '阿里百炼', type: 'image', fixedPerUnit: 0.50 },
  'wanx2.1-t2i-turbo': { vendor: '阿里百炼', type: 'image', fixedPerUnit: 0.14 },
  'wan2.6-t2v': { vendor: '阿里百炼', type: 'video', fixedPerUnit: 5.00 },
  'wan2.6-r2v': { vendor: '阿里百炼', type: 'video', fixedPerUnit: 5.00 },
  'wan2.6-i2v': { vendor: '阿里百炼', type: 'video', fixedPerUnit: 3.00 },
  'wanx2.1-t2v-plus': { vendor: '阿里百炼', type: 'video', fixedPerUnit: 3.50 },
  'wanx2.1-i2v-plus': { vendor: '阿里百炼', type: 'video', fixedPerUnit: 3.50 },
  'wanx2.1-t2v-turbo': { vendor: '阿里百炼', type: 'video', fixedPerUnit: 1.20 },

  // ===================== 7. DeepSeek 深度求索系列 =====================
  'deepseek-chat': { vendor: 'DeepSeek', type: 'chat', promptPer1k: 0.002, completionPer1k: 0.002 },
  'deepseek-v3': { vendor: 'DeepSeek', type: 'chat', promptPer1k: 0.002, completionPer1k: 0.002 },
  'deepseek-v3.1': { vendor: 'DeepSeek', type: 'chat', promptPer1k: 0.0028, completionPer1k: 0.0084 },
  'deepseek-r1': { vendor: 'DeepSeek', type: 'chat', promptPer1k: 0.004, completionPer1k: 0.016 },
  'deepseek-reasoner': { vendor: 'DeepSeek', type: 'chat', promptPer1k: 0.004, completionPer1k: 0.016 },
  'deepseek-v4-flash': { vendor: 'DeepSeek', type: 'chat', promptPer1k: 0.001, completionPer1k: 0.002 },

  // ===================== 8. xAI Grok 系列 =====================
  'grok-3': { vendor: 'xAI', type: 'chat', promptPer1k: 0.0016, completionPer1k: 0.008 },
  'grok-4': { vendor: 'xAI', type: 'chat', promptPer1k: 0.002, completionPer1k: 0.006 },
  'grok-4.6': { vendor: 'xAI', type: 'chat', promptPer1k: 0.002, completionPer1k: 0.006 },
  'grok-2-vision-1212': { vendor: 'xAI', type: 'vision', promptPer1k: 0.008, completionPer1k: 0.04 },
  'grok-imagine-image-2.0': { vendor: 'xAI', type: 'image', fixedPerUnit: 0.12 },
  'grok-imagine-image': { vendor: 'xAI', type: 'image', fixedPerUnit: 0.06 },
  'grok-imagine-video-1.5': { vendor: 'xAI', type: 'video', perSecPrice: 0.24 },

  // ===================== 9. MiniMax (海螺 AI) 系列 =====================
  'MiniMax-Hailuo-2.3': { vendor: 'MiniMax', type: 'video', fixedPerUnit: 2.00 },
  'MiniMax-Hailuo-02': { vendor: 'MiniMax', type: 'video', fixedPerUnit: 0.60 },
  'MiniMax-M2.7': { vendor: 'MiniMax', type: 'chat', promptPer1k: 0.0021, completionPer1k: 0.0084 },
  'MiniMax-M2.5': { vendor: 'MiniMax', type: 'chat', promptPer1k: 0.0021, completionPer1k: 0.0084 },

  // ===================== 10. FLUX / Midjourney / 其他生图视频 =====================
  'flux': { vendor: 'FLUX', type: 'image', fixedPerUnit: 0.01 },
  'flux-schnell': { vendor: 'FLUX', type: 'image', fixedPerUnit: 0.01 },
  'flux-dev': { vendor: 'FLUX', type: 'image', fixedPerUnit: 0.03 },
  'flux-pro': { vendor: 'FLUX', type: 'image', fixedPerUnit: 0.05 },
  'flux.1.1-pro': { vendor: 'FLUX', type: 'image', fixedPerUnit: 0.10 },
  'flux-pro-max': { vendor: 'FLUX', type: 'image', fixedPerUnit: 0.10 },
  'flux-pro-1.1-ultra': { vendor: 'FLUX', type: 'image', fixedPerUnit: 0.25 },
  'mj_fast_imagine': { vendor: 'Midjourney', type: 'image', fixedPerUnit: 0.20 },
  'mj_relax_imagine': { vendor: 'Midjourney', type: 'image', fixedPerUnit: 0.08 },
  'luma_video_api': { vendor: 'Luma AI', type: 'video', fixedPerUnit: 2.00 },
  'runway-generate': { vendor: 'Runway', type: 'video', fixedPerUnit: 0.60 },
  'runwayml-gen3a_turbo': { vendor: 'Runway', type: 'video', fixedPerUnit: 0.80 },
  'vidu1.5': { vendor: '生数科技', type: 'video', fixedPerUnit: 1.20 },
  'vidu2.0': { vendor: '生数科技', type: 'video', fixedPerUnit: 1.50 },
  'moonshot-v1-128k': { vendor: '月之暗面', type: 'chat', promptPer1k: 0.048, completionPer1k: 0.048 },
  'kimi-k2.5': { vendor: '月之暗面', type: 'chat', promptPer1k: 0.004, completionPer1k: 0.021 }
};

export interface UsageLogItem {
  id: string;
  timestamp: number; // Date.now()
  modelId: string;
  modelName: string;
  provider: string;
  type: 'image' | 'video' | 'chat' | 'vision' | 'distill';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  mediaCount?: number;
  costUsd: number;  // 算力点 / 美元消耗 ($)
  costRmb: number;  // 折算人民币金额 (¥) = costUsd * 1.2
  success: boolean;
  cached?: boolean;
}

const STORAGE_KEY = 'app_real_usage_logs';

/**
 * 🌟 严格依据 Comfly 官方报价单与扣费公式计算调用成本 ($USD)
 * 
 * 扣费公式:
 * - 文本类: (Prompt Tokens / 1000) * Prompt 单价 + (Completion Tokens / 1000) * Completion 单价
 * - 生图类: 固定单价 ($/张) * 数量
 * - 视频类: 固定单价或 (按秒单价 * 秒数) * 数量
 */
export function estimateModelCost(
  modelId: string, 
  type: 'image' | 'video' | 'chat' | 'vision' | 'distill', 
  params: { promptTokens?: number; completionTokens?: number; totalTokens?: number; mediaCount?: number; duration?: number }
): number {
  const m = modelId.toLowerCase().trim();
  
  // 1. 优先在官方单价字典中精确查找
  let rule = COMFY_MODEL_PRICING[m];
  if (!rule) {
    // 模糊匹配前缀
    const matchedKey = Object.keys(COMFY_MODEL_PRICING).find(k => m.includes(k) || k.includes(m));
    if (matchedKey) rule = COMFY_MODEL_PRICING[matchedKey];
  }

  // 2. 图片生成计费
  if (type === 'image') {
    const count = params.mediaCount || 1;
    if (rule?.fixedPerUnit) return count * rule.fixedPerUnit;
    if (m.includes('gpt-image-2-4k') || m.includes('image2-4k')) return count * 0.08;
    if (m.includes('gpt-image-2')) return count * 0.06;
    if (m.includes('seedream-5') || m.includes('seededit')) return count * 0.15;
    if (m.includes('seedream')) return count * 0.14;
    if (m.includes('flux-ultra') || m.includes('1.1-ultra')) return count * 0.25;
    if (m.includes('flux-pro') || m.includes('1.1-pro')) return count * 0.10;
    if (m.includes('flux')) return count * 0.01;
    if (m.includes('midjourney') || m.includes('mj')) return count * 0.20;
    if (m.includes('dall-e-3')) return count * 0.04;
    if (m.includes('kling')) return count * 0.10;
    if (m.includes('qwen-image')) return count * 0.25;
    return count * 0.05;
  }

  // 3. 视频生成计费
  if (type === 'video') {
    const count = params.mediaCount || 1;
    const dur = params.duration || 5;
    if (rule?.perSecPrice) return count * dur * rule.perSecPrice;
    if (rule?.fixedPerUnit) return count * rule.fixedPerUnit;
    if (m.includes('seedance-2.0') || m.includes('seedance-2-0')) return count * dur * 0.50;
    if (m.includes('seedance')) return count * (dur >= 10 ? 5.0 : 2.5);
    if (m.includes('kling-v2-master')) return count * (dur >= 10 ? 20.0 : 10.0);
    if (m.includes('kling')) return count * (dur >= 10 ? 5.0 : 2.5);
    if (m.includes('veo3.1-pro-4k')) return count * 13.0;
    if (m.includes('veo3') || m.includes('veo2') || m.includes('veo')) return count * 1.20;
    if (m.includes('wan2.6')) return count * 5.00;
    if (m.includes('wanx')) return count * 3.50;
    if (m.includes('hailuo-2.3') || m.includes('minimax')) return count * (dur >= 10 ? 4.0 : 2.0);
    if (m.includes('hailuo-02')) return count * (dur >= 10 ? 1.0 : 0.6);
    if (m.includes('sora')) return count * dur * 0.40;
    if (m.includes('luma')) return count * 2.00;
    if (m.includes('runway')) return count * 0.80;
    return count * 2.00;
  }

  // 4. 对话 / 视觉分析 / 深度思考 / Skill 提炼 (Token 扣费标准)
  let promptTokens = params.promptTokens;
  let completionTokens = params.completionTokens;

  if (promptTokens === undefined && completionTokens === undefined) {
    const total = params.totalTokens || 500;
    // 默认按照 60% 输入，40% 输出拆分
    promptTokens = Math.round(total * 0.6);
    completionTokens = Math.round(total * 0.4);
  } else {
    promptTokens = promptTokens || 0;
    completionTokens = completionTokens || 0;
  }

  const pPrice = rule?.promptPer1k ?? 0.0015;
  const cPrice = rule?.completionPer1k ?? 0.0075;

  // 官方扣费公式: (Prompt / 1000) * PromptPrice + (Completion / 1000) * CompletionPrice
  const cost = (promptTokens / 1000) * pPrice + (completionTokens / 1000) * cPrice;
  return Number(cost.toFixed(6));
}

/**
 * 获取所有持久化真实调用日志
 */
export function getUsageLogs(): UsageLogItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('读取用量统计日志失败:', e);
    return [];
  }
}

/**
 * 记录一次真实模型调用
 */
export function recordModelUsage(item: Omit<UsageLogItem, 'id' | 'timestamp' | 'costUsd' | 'costRmb'> & { 
  timestamp?: number;
  costUsd?: number;
  duration?: number;
}): void {
  if (typeof window !== 'undefined') {
    try {
      const logs = getUsageLogs();
      const calculatedCostUsd = item.costUsd !== undefined 
        ? item.costUsd 
        : estimateModelCost(item.modelId, item.type, {
            promptTokens: item.promptTokens,
            completionTokens: item.completionTokens,
            totalTokens: item.totalTokens,
            mediaCount: item.mediaCount,
            duration: item.duration
          });

      const costUsd = Number(calculatedCostUsd.toFixed(6));
      const costRmb = Number((costUsd * COMFLY_QUOTA_TO_RMB_RATIO).toFixed(6));

      // 提取供应商名称
      let vendor = item.provider;
      if (!vendor || vendor === 'Gateway') {
        const mKey = item.modelId.toLowerCase();
        const rule = COMFY_MODEL_PRICING[mKey] || Object.values(COMFY_MODEL_PRICING).find((_, idx) => mKey.includes(Object.keys(COMFY_MODEL_PRICING)[idx]));
        vendor = rule?.vendor || 'Comfly 网关';
      }

      const newLog: UsageLogItem = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        timestamp: item.timestamp || Date.now(),
        modelId: item.modelId,
        modelName: item.modelName || item.modelId,
        provider: vendor,
        type: item.type,
        promptTokens: item.promptTokens || 0,
        completionTokens: item.completionTokens || 0,
        totalTokens: item.totalTokens || ((item.promptTokens || 0) + (item.completionTokens || 0)) || 0,
        mediaCount: item.mediaCount || (item.type === 'image' || item.type === 'video' ? 1 : 0),
        costUsd,
        costRmb,
        success: item.success,
        cached: !!item.cached
      };

      logs.unshift(newLog);
      // 保留最近 1000 条调用记录
      const trimmed = logs.slice(0, 1000);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.error('记录用量统计失败:', e);
    }
  }
}

/**
 * 清空用量统计日志
 */
export function clearUsageLogs(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export interface UsageSummary {
  totalCostUsd: number;     // 总算力点 / 美元消耗 ($)
  totalCostRmb: number;     // 折算人民币金额 (¥)
  totalRequests: number;    // 总请求次数
  totalTokens: number;      // 总 Token 吞吐
  cacheHitRate: number;     // 缓存命中率
  activeDays: number;       // 活跃天数
  peakDayLabel: string;     // 高峰日
  peakDayTokens: number;    // 高峰日 Token
  topModelName: string;     // 用量最高模型
  topModelTokens: number;
  dailyAvgTokens: number;
  dailyAvgRequests: number;
  modelBreakdown: {
    id: string;
    name: string;
    vendor: string;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    mediaCount: number;
    type: string;
    costUsd: number;
    costRmb: number;
  }[];
  recentDaysActivity: {
    date: string;
    tokens: number;
    costUsd: number;
    costRmb: number;
    requests: number;
    items: { vendor: string; tokens: number; color: string }[];
  }[];
  heatmapActiveMap: Record<string, number>;
}

/**
 * 计算指定时间范围内的真实统计指标
 */
export function getUsageSummary(range: '30d' | '90d' | '1y' = '30d'): UsageSummary {
  const allLogs = getUsageLogs();
  const now = Date.now();
  const daysLimit = range === '30d' ? 30 : range === '90d' ? 90 : 365;
  const cutoffTime = now - daysLimit * 24 * 60 * 60 * 1000;

  const filteredLogs = allLogs.filter(l => l.timestamp >= cutoffTime);

  if (filteredLogs.length === 0) {
    return {
      totalCostUsd: 0,
      totalCostRmb: 0,
      totalRequests: 0,
      totalTokens: 0,
      cacheHitRate: 0,
      activeDays: 0,
      peakDayLabel: '暂无数据',
      peakDayTokens: 0,
      topModelName: '暂无模型调用',
      topModelTokens: 0,
      dailyAvgTokens: 0,
      dailyAvgRequests: 0,
      modelBreakdown: [],
      recentDaysActivity: generateEmptyRecentDays(7),
      heatmapActiveMap: {}
    };
  }

  let totalCostUsd = 0;
  let totalCostRmb = 0;
  let totalTokens = 0;
  let cachedCount = 0;
  const dayTokensMap: Record<string, number> = {};
  const dayRequestsMap: Record<string, number> = {};
  const dayCostUsdMap: Record<string, number> = {};
  const dayCostRmbMap: Record<string, number> = {};
  const modelMap: Record<string, {
    id: string;
    name: string;
    vendor: string;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    mediaCount: number;
    type: string;
    costUsd: number;
    costRmb: number;
  }> = {};

  const ratio = getQuotaToRmbRatio();

  filteredLogs.forEach(log => {
    // 🌟 自动校准历史遗留日志的厂商名称
    let correctedVendor = log.provider;
    const mId = (log.modelId || '').toLowerCase();
    if (mId.includes('grok')) correctedVendor = 'xAI';
    else if (mId.includes('gpt') || mId.includes('o1') || mId.includes('o3') || mId.includes('dall-e')) correctedVendor = 'OpenAI';
    else if (mId.includes('gemini') || mId.includes('veo') || mId.includes('imagen')) correctedVendor = 'Google';
    else if (mId.includes('seedream') || mId.includes('doubao') || mId.includes('seedance')) correctedVendor = '字节即梦';
    else if (mId.includes('claude')) correctedVendor = 'Anthropic';
    else if (mId.includes('qwen') || mId.includes('wanx') || mId.includes('wan2')) correctedVendor = '阿里百炼';
    else if (mId.includes('deepseek')) correctedVendor = 'DeepSeek';

    // 🌟 纠正生图计数：仅限 image/video 类型的调用才计入生图数，vision/chat 视觉分析不计入
    const isMedia = log.type === 'image' || log.type === 'video';
    const effectiveMediaCount = isMedia ? (log.mediaCount || 1) : 0;

    const costUsd = log.costUsd || 0;
    const costRmb = Number((costUsd * ratio).toFixed(4));

    totalCostUsd += costUsd;
    totalCostRmb += costRmb;
    totalTokens += log.totalTokens || 0;
    if (log.cached) cachedCount++;

    // 按天归并 (YYYY-MM-DD)
    const d = new Date(log.timestamp);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dayTokensMap[dateKey] = (dayTokensMap[dateKey] || 0) + (log.totalTokens || 0);
    dayRequestsMap[dateKey] = (dayRequestsMap[dateKey] || 0) + 1;
    dayCostUsdMap[dateKey] = (dayCostUsdMap[dateKey] || 0) + costUsd;
    dayCostRmbMap[dateKey] = (dayCostRmbMap[dateKey] || 0) + costRmb;

    // 按模型归并
    const mKey = log.modelId || log.modelName || 'unknown';
    if (!modelMap[mKey]) {
      modelMap[mKey] = {
        id: log.modelId,
        name: log.modelName || log.modelId,
        vendor: correctedVendor || 'Comfly 网关',
        calls: 0,
        tokensIn: 0,
        tokensOut: 0,
        totalTokens: 0,
        mediaCount: 0,
        type: log.type,
        costUsd: 0,
        costRmb: 0
      };
    }
    modelMap[mKey].calls += 1;
    modelMap[mKey].vendor = correctedVendor || modelMap[mKey].vendor;
    modelMap[mKey].tokensIn += log.promptTokens || 0;
    modelMap[mKey].tokensOut += log.completionTokens || 0;
    modelMap[mKey].totalTokens += log.totalTokens || 0;
    modelMap[mKey].mediaCount += effectiveMediaCount;
    modelMap[mKey].costUsd += costUsd;
    modelMap[mKey].costRmb += costRmb;
  });

  const activeDays = Object.keys(dayRequestsMap).length;
  const cacheHitRate = filteredLogs.length > 0 ? (cachedCount / filteredLogs.length) * 100 : 0;

  // 寻找高峰日
  let peakDayLabel = '暂无数据';
  let peakDayTokens = 0;
  Object.entries(dayTokensMap).forEach(([dateKey, tokens]) => {
    if (tokens > peakDayTokens) {
      peakDayTokens = tokens;
      peakDayLabel = dateKey;
    }
  });

  // 寻找用量最高模型
  let topModelName = '暂无模型';
  let topModelTokens = 0;
  const modelBreakdown = Object.values(modelMap).sort((a, b) => b.calls - a.calls || b.totalTokens - a.totalTokens);
  if (modelBreakdown.length > 0) {
    topModelName = modelBreakdown[0].name;
    topModelTokens = modelBreakdown[0].totalTokens;
  }

  // 生成最近7天活动走势
  const recentDaysActivity = [];
  const VENDOR_COLORS: Record<string, string> = {
    'Google': 'bg-[#3B82F6]',
    'OpenAI': 'bg-[#EA580C]',
    'Anthropic': 'bg-[#D97706]',
    '字节即梦': 'bg-[#0D9488]',
    '快手可灵': 'bg-[#10B981]',
    '阿里百炼': 'bg-[#8B5CF6]',
    'DeepSeek': 'bg-[#06B6D4]',
    'xAI': 'bg-[#EC4899]',
    'MiniMax': 'bg-[#14B8A6]',
    'FLUX': 'bg-[#F97316]'
  };

  for (let i = 6; i >= 0; i--) {
    const t = new Date(now - i * 24 * 60 * 60 * 1000);
    const dateKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const label = i === 0 ? '今天' : `${t.getMonth() + 1}/${t.getDate()}`;
    const dayLogs = filteredLogs.filter(l => {
      const ld = new Date(l.timestamp);
      return `${ld.getFullYear()}-${String(ld.getMonth() + 1).padStart(2, '0')}-${String(ld.getDate()).padStart(2, '0')}` === dateKey;
    });

    const vendorGroup: Record<string, number> = {};
    dayLogs.forEach(l => {
      const v = l.provider || 'Comfly 网关';
      vendorGroup[v] = (vendorGroup[v] || 0) + (l.totalTokens || 100);
    });

    const items = Object.entries(vendorGroup).map(([vendor, tokens]) => ({
      vendor,
      tokens,
      color: VENDOR_COLORS[vendor] || 'bg-slate-700'
    }));

    recentDaysActivity.push({
      date: label,
      tokens: dayTokensMap[dateKey] || 0,
      costUsd: dayCostUsdMap[dateKey] || 0,
      costRmb: dayCostRmbMap[dateKey] || 0,
      requests: dayRequestsMap[dateKey] || 0,
      items
    });
  }

  return {
    totalCostUsd: Number(totalCostUsd.toFixed(4)),
    totalCostRmb: Number(totalCostRmb.toFixed(4)),
    totalRequests: filteredLogs.length,
    totalTokens,
    cacheHitRate: Number(cacheHitRate.toFixed(1)),
    activeDays,
    peakDayLabel,
    peakDayTokens,
    topModelName,
    topModelTokens,
    dailyAvgTokens: Math.round(totalTokens / Math.max(1, activeDays)),
    dailyAvgRequests: Math.round(filteredLogs.length / Math.max(1, activeDays)),
    modelBreakdown,
    recentDaysActivity,
    heatmapActiveMap: dayRequestsMap
  };
}

function generateEmptyRecentDays(count: number) {
  const days = [];
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(now - i * 24 * 60 * 60 * 1000);
    days.push({
      date: i === 0 ? '今天' : `${t.getMonth() + 1}/${t.getDate()}`,
      tokens: 0,
      costUsd: 0,
      costRmb: 0,
      requests: 0,
      items: []
    });
  }
  return days;
}
