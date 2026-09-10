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
  'nano-banana': { vendor: 'Google', type: 'image', fixedPerUnit: 0.08 },
  'nano-banana-2': { vendor: 'Google', type: 'image', fixedPerUnit: 0.08 },
  'nano-banana-2-2k': { vendor: 'Google', type: 'image', fixedPerUnit: 0.08 },
  'nano-banana-2-4k': { vendor: 'Google', type: 'image', fixedPerUnit: 0.12 },
  'nano-banana-3.1-flash': { vendor: 'Google', type: 'image', fixedPerUnit: 0.08 },
  'nano-banana-3.1-flash-lite': { vendor: 'Google', type: 'image', fixedPerUnit: 0.04 },
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
  'gpt-5.5-pro': { vendor: 'OpenAI', type: 'vision', promptPer1k: 0.015, completionPer1k: 0.12 },
  'gpt-5.6-luna': { vendor: 'OpenAI', type: 'vision', promptPer1k: 0.0025, completionPer1k: 0.015 },
  'claude-3-7-sonnet-thinking': { vendor: 'Anthropic', type: 'vision', promptPer1k: 0.003, completionPer1k: 0.015 },
  'gemini-1.5-flash': { vendor: 'Google', type: 'vision', promptPer1k: 0.0006, completionPer1k: 0.005 },
  'gemini-1.5-pro': { vendor: 'Google', type: 'vision', promptPer1k: 0.0025, completionPer1k: 0.02 },
  'gemini-2.0-flash': { vendor: 'Google', type: 'vision', promptPer1k: 0.0006, completionPer1k: 0.005 },
  'gpt-5.4': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.0025, completionPer1k: 0.015 },
  'gpt-5.4-mini': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.00075, completionPer1k: 0.0045 },
  'gpt-5.2': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.00175, completionPer1k: 0.014 },
  'gpt-5.1': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.00125, completionPer1k: 0.01 },
  // OpenAI 生图与视频
  'gpt-image-2': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.06 },
  'gpt-image-2-all': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.04 },
  'gpt-image-2-4k': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.08 },
  'gpt-image-2-2k': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.06 },
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
