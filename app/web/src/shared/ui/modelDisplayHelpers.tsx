import React from 'react';

/** 网关 / 存储里常见的无意义占位厂商或微标（大小写不敏感） */
const PLACEHOLDER_MODEL_META = new Set([
  'official',
  'gateway',
  'system',
  '官方直连',
]);

export function isPlaceholderModelMeta(value?: string | null): boolean {
  const trimmed = (value || '').trim();
  if (!trimmed) return true;
  return PLACEHOLDER_MODEL_META.has(trimmed.toLowerCase());
}

// 智能提取厂商真实品牌名称
export function getModelProviderName(modelId: string = '', modelName: string = '', rawProvider?: string): string {
  if (rawProvider && !isPlaceholderModelMeta(rawProvider)) {
    return rawProvider.trim();
  }
  const low = `${modelId} ${modelName}`.toLowerCase();
  if (low.includes('gpt') || low.includes('dall-e') || low.includes('openai') || low.includes('sora')) return 'OpenAI';
  if (low.includes('grok') || low.includes('xai')) return 'xAI';
  if (low.includes('seedream') || low.includes('seedance') || low.includes('doubao') || low.includes('bytedance') || low.includes('即梦') || low.includes('火山')) return '字节即梦';
  if (low.includes('midjourney') || low.includes('mj')) return 'Midjourney';
  if (low.includes('gemini') || low.includes('imagen') || low.includes('google') || low.includes('veo')) return 'Google';
  if (low.includes('flux') || low.includes('black forest')) return 'BFL FLUX';
  if (low.includes('claude') || low.includes('anthropic')) return 'Anthropic';
  if (low.includes('kling') || low.includes('可灵') || low.includes('kuaishou')) return '快手可灵';
  if (low.includes('minimax') || low.includes('hailuo') || low.includes('海螺')) return 'MiniMax';
  if (low.includes('wanx') || low.includes('qwen') || low.includes('tongyi') || low.includes('通义')) return '阿里通义';
  if (low.includes('deepseek')) return 'DeepSeek';
  if (low.includes('zhipu') || low.includes('cogview') || low.includes('glm')) return '智谱AI';
  if (low.includes('sd') || low.includes('stable diffusion') || low.includes('stability')) return 'Stability AI';
  if (low.includes('recraft')) return 'Recraft AI';
  if (low.includes('vidu')) return '生数科技';
  if (low.includes('runway') || low.includes('gen-3') || low.includes('gen3')) return 'Runway';
  if (low.includes('kimi') || low.includes('moonshot')) return '月之暗面';
  return '官方直连';
}

// 智能获取模型特色微标
export function getModelBadgeName(modelId: string = '', modelName: string = '', rawBadge?: string): string {
  if (rawBadge && !isPlaceholderModelMeta(rawBadge)) {
    return rawBadge.trim();
  }
  const low = `${modelId} ${modelName}`.toLowerCase();
  if (low.includes('gpt-image-2-4k') || low.includes('image2-4k')) return '4K专线';
  if (low.includes('gpt-image-2-2k')) return '2K';
  if (low.includes('gpt-image-2')) return '4K标准';
  if (low.includes('grok')) return '反AI实拍';
  if (low.includes('seedream-5')) return '电商爆款';
  if (low.includes('seedream')) return '极速电商';
  if (low.includes('midjourney')) return '艺术质感';
  if (low.includes('gemini')) return '极速4K';
  if (low.includes('flux')) return '极致光影';
  if (low.includes('kling')) return '电影级';
  if (low.includes('seedance-2.5')) return '最强视频';
  if (low.includes('seedance-2.0')) return '性价比';
  if (low.includes('veo')) return '电影级4K';
  if (low.includes('sora')) return '世界模型';
  return '官方推荐';
}

// 渲染迷你比例轮廓框图标
export function renderRatioMiniIcon(iconType?: string, className = "w-3.5 h-3.5 opacity-80 shrink-0") {
  if (iconType === 'smart') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
        <rect x="8" y="8" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5" />
      </svg>
    );
  }
  if (iconType === 'ultrawide') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="1" y="8" width="22" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'wide169') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="7" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'wide32') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'wide43') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'square') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="4.5" y="4.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'tall34') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'tall23') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'tall916') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

