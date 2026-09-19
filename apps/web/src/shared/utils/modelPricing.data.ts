export interface ModelPricingRule {
  vendor: string;
  type: 'chat' | 'vision' | 'image' | 'video' | 'audio';
  promptPer1k?: number;
  completionPer1k?: number;
  fixedPerUnit?: number;
  perSecPrice?: number;
}

/** 仅收录当前白名单模型的报价，避免过时模型污染用量统计 */
export const COMFY_MODEL_PRICING: Record<string, ModelPricingRule> = {
  'gpt-5.6-luna': { vendor: 'OpenAI', type: 'vision', promptPer1k: 0.0025, completionPer1k: 0.015 },
  'gpt-5.6-sol': { vendor: 'OpenAI', type: 'vision', promptPer1k: 0.0025, completionPer1k: 0.015 },
  'gpt-5.6-terra': { vendor: 'OpenAI', type: 'vision', promptPer1k: 0.0025, completionPer1k: 0.015 },
  'gpt-5.4-mini': { vendor: 'OpenAI', type: 'chat', promptPer1k: 0.00075, completionPer1k: 0.0045 },
  'gpt-image-2': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.06 },
  'gpt-image-2.5-flare': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.08 },
  'gpt-image-2.5-sunburst': { vendor: 'OpenAI', type: 'image', fixedPerUnit: 0.08 },
  'sora-2': { vendor: 'OpenAI', type: 'video', perSecPrice: 0.40 },
  'sora-2-pro': { vendor: 'OpenAI', type: 'video', perSecPrice: 1.20 },

  'claude-opus-5': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.005, completionPer1k: 0.025 },
  'claude-fable-5': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.05, completionPer1k: 0.25 },
  'claude-opus-4-7': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.005, completionPer1k: 0.025 },
  'claude-haiku-4-5-20251001-thinking': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.001, completionPer1k: 0.005 },
  'claude-sonnet-5': { vendor: 'Anthropic', type: 'chat', promptPer1k: 0.002, completionPer1k: 0.01 },

  'gemini-3.8-flash': { vendor: 'Google', type: 'vision', promptPer1k: 0.0015, completionPer1k: 0.0075 },
  'gemini-3.7-flash': { vendor: 'Google', type: 'vision', promptPer1k: 0.0015, completionPer1k: 0.0075 },
  'gemini-3.1-pro-preview': { vendor: 'Google', type: 'vision', promptPer1k: 0.004, completionPer1k: 0.024 },
  'nano-banana': { vendor: 'Google', type: 'image', fixedPerUnit: 0.08 },
  'nano-banana-pro': { vendor: 'Google', type: 'image', fixedPerUnit: 0.12 },
  'veo3.1': { vendor: 'Google', type: 'video', fixedPerUnit: 7.00 },
  'veo3.1-fast': { vendor: 'Google', type: 'video', fixedPerUnit: 1.20 },
  'omni_flash-10s': { vendor: 'Google', type: 'video', fixedPerUnit: 1.20 },

  'doubao-seedream-4-0-250828': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.14 },
  'doubao-seedream-4-5-251128': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.15 },
  'doubao-seedream-5-0-260128': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.15 },
  'seedream-v5-pro': { vendor: '字节即梦', type: 'image', fixedPerUnit: 0.18 },
  'doubao-seedance-2.0-mini': { vendor: '字节即梦', type: 'video', perSecPrice: 0.50 },
  'doubao-seedance-2-0-260128': { vendor: '字节即梦', type: 'video', perSecPrice: 1.00 },
  'doubao-seedance-2-0-fast-260128': { vendor: '字节即梦', type: 'video', perSecPrice: 0.90 },
  'doubao-seedance-2.5': { vendor: '字节即梦', type: 'video', perSecPrice: 1.20 },

  'qwen-image-max': { vendor: '阿里百炼', type: 'image', fixedPerUnit: 0.30 },
  'z-image-turbo': { vendor: '阿里百炼', type: 'image', fixedPerUnit: 0.08 },
  'qwen-image': { vendor: '阿里百炼', type: 'image', fixedPerUnit: 0.25 },
  'qwen-image-edit': { vendor: '阿里百炼', type: 'image', fixedPerUnit: 0.30 },
  'qwen3.8-max': { vendor: '阿里百炼', type: 'chat', promptPer1k: 0.0025, completionPer1k: 0.025 },
  'wan3.0-video': { vendor: '阿里百炼', type: 'video', perSecPrice: 0.40 },

  'midjourney': { vendor: 'Midjourney', type: 'image', fixedPerUnit: 0.22 },
  'flux': { vendor: 'FLUX', type: 'image', fixedPerUnit: 0.01 },
  'flux-pro-max': { vendor: 'FLUX', type: 'image', fixedPerUnit: 0.10 },

  'kling-video-v3': { vendor: '快手可灵', type: 'video', fixedPerUnit: 2.50 },
  'kling-video-v3-omni': { vendor: '快手可灵', type: 'video', fixedPerUnit: 2.80 },
  'kling-video-v2-5-turbo': { vendor: '快手可灵', type: 'video', fixedPerUnit: 2.00 },
  'kling-video-v2-6': { vendor: '快手可灵', type: 'video', fixedPerUnit: 2.50 },

  'grok-4.6': { vendor: 'xAI', type: 'chat', promptPer1k: 0.002, completionPer1k: 0.006 },
  'grok-4.1-image': { vendor: 'xAI', type: 'image', fixedPerUnit: 0.10 },
  'grok-4.2-image': { vendor: 'xAI', type: 'image', fixedPerUnit: 0.12 },
  'grok-imagine-image-quality': { vendor: 'xAI', type: 'image', fixedPerUnit: 0.12 },
  'grok-imagine-video-1.5': { vendor: 'xAI', type: 'video', perSecPrice: 0.24 },

  'MiniMax-H3': { vendor: 'MiniMax', type: 'video', fixedPerUnit: 2.00 },
  'deepseek-v4.1-flash': { vendor: 'DeepSeek', type: 'chat', promptPer1k: 0.001, completionPer1k: 0.002 },
  'deepseek-v4-flash': { vendor: 'DeepSeek', type: 'chat', promptPer1k: 0.001, completionPer1k: 0.002 },
  'kimi-k3': { vendor: '月之暗面', type: 'chat', promptPer1k: 0.004, completionPer1k: 0.021 },
  'viduq3': { vendor: '生数科技', type: 'video', fixedPerUnit: 1.50 },
  'viduq3-mix': { vendor: '生数科技', type: 'video', fixedPerUnit: 1.50 },
  'viduq3-turbo': { vendor: '生数科技', type: 'video', fixedPerUnit: 1.20 },
  'viduq3-pro': { vendor: '生数科技', type: 'video', fixedPerUnit: 2.00 },
};
