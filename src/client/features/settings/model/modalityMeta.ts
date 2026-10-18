import type { ModalityKind, ModalityModelItem, ModalityVendorOption } from './modalityModelTypes';
import { classifyModel } from './modalityClassifier';

export { isLegacyOrDiscontinuedModel } from '@shared/domain/models/modelParsing';

export const MODALITY_TITLES: Record<ModalityKind, { title: string; subtitle: string }> = {
  chat: {
    title: '多模态',
    subtitle: '对话界面接入的模型即多模态模型，支持视觉理解、分镜规划与高精度推理。',
  },
  image: {
    title: '绘画',
    subtitle: '商业生图、局部重绘与创意插画模型线路配置。',
  },
  video: {
    title: '视频',
    subtitle: '文生视频、图生视频、超分与长镜头视频生成线路配置。',
  },
  three_d: {
    title: '3D',
    subtitle: '混元与 Tripo 的 3D 资产生成。Comfly 调用混元时模型 ID 需带 fal-ai/ 前缀。',
  },
  music: {
    title: '音乐',
    subtitle: 'Suno、ElevenLabs 与 MiniMax 音乐线路。调用接口稍后接入。',
  },
  voice: {
    title: '语音',
    subtitle: '高保真文本转语音、克隆声音与智能配音模型。',
  },
  avatar: {
    title: '数字人',
    subtitle: '照片数字人与视频对口型的驱动模型。配音仍在语音线路配置。',
  },
};

export const GLOBAL_ALL_VENDORS: ModalityVendorOption[] = [
  { id: 'openai', name: 'OpenAI', logoKey: 'openai', keywords: ['gpt', 'openai', 'chatgpt', 'dall', 'sora'] },
  { id: 'anthropic', name: 'Anthropic', logoKey: 'claude', keywords: ['claude', 'anthropic'] },
  { id: 'google', name: 'Google', logoKey: 'google', keywords: ['gemini', 'gemma', 'google', 'imagen', 'palm', 'veo', 'banana', 'omni_flash'] },
  { id: 'deepseek', name: 'DeepSeek', logoKey: 'deepseek', keywords: ['deepseek'] },
  { id: 'bytedance', name: '字节', logoKey: 'bytedance', keywords: ['doubao', 'jimeng', 'bytedance', 'volc', 'skylark', 'seedream', 'seedance'] },
  { id: 'qwen', name: 'Qwen', logoKey: 'qwen', keywords: ['qwen', 'tongyi', 'cosyvoice', 'wanx', 'wan', 'z-image', 'dashscope'] },
  { id: 'flux', name: 'Flux', logoKey: 'flux', keywords: ['flux', 'bfl'] },
  { id: 'xai', name: 'xAI', logoKey: 'grok', keywords: ['grok', 'xai'] },
  { id: 'moonshot', name: 'Moonshot', logoKey: 'moonshot', keywords: ['moonshot', 'kimi'] },
  { id: 'minimax', name: 'MiniMax', logoKey: 'minimax', keywords: ['minimax', 'abab', 'hailuo'] },
  { id: 'glm', name: 'GLM', logoKey: 'zhipu', keywords: ['glm', 'zhipu', 'chatglm', 'cogview'] },
  { id: 'kling', name: 'Kling', logoKey: 'kling', keywords: ['kling', 'kolors', 'keling', 'kuaishou'] },
  { id: 'midjourney', name: 'MJ', logoKey: 'midjourney', keywords: ['midjourney', 'niji', 'mj'] },
  { id: 'vidu', name: 'Vidu', logoKey: 'vidu', keywords: ['vidu', 'shengshu'] },
  { id: 'meta', name: 'Meta', logoKey: 'meta', keywords: ['llama', 'meta'] },
  { id: 'xiaomi', name: '小米', logoKey: 'xiaomi', keywords: ['xiaomi', 'mimo'] },
  { id: 'yi', name: '零一万物', logoKey: 'yi', keywords: ['yi-', 'yi_', '01.ai', '01ai', '01-ai', 'yi-lightning', 'yi-large'] },
  { id: 'baidu', name: '百度文心', logoKey: 'baidu', keywords: ['ernie', 'baidu', 'wenxin', '文心'] },
  { id: 'baichuan', name: '百川智能', logoKey: 'baichuan', keywords: ['baichuan', '百川'] },
  { id: 'stepfun', name: '阶跃星辰', logoKey: 'stepfun', keywords: ['stepfun', 'step-', 'step_'] },
  { id: 'sensenova', name: '商汤', logoKey: 'sensenova', keywords: ['sensenova', 'sensechat', 'internlm', 'internvl', '商汤'] },
  { id: 'mistral', name: 'Mistral', logoKey: 'mistral', keywords: ['mistral', 'pixtral', 'codestral', 'mixtral'] },
  { id: 'hunyuan', name: '混元', logoKey: 'hunyuan', keywords: ['hunyuan'] },
  { id: 'luma', name: 'Luma', logoKey: 'luma', keywords: ['luma', 'dream-machine'] },
  { id: 'runway', name: 'Runway', logoKey: 'runway', keywords: ['runway', 'gen-2', 'gen-3', 'gen2', 'gen3'] },
  { id: 'pika', name: 'Pika', logoKey: 'pika', keywords: ['pika'] },
  { id: 'recraft', name: 'Recraft', logoKey: 'recraft', keywords: ['recraft'] },
  { id: 'tripo', name: 'Tripo', logoKey: 'tripo', keywords: ['tripo'] },
  { id: 'suno', name: 'Suno', logoKey: 'suno', keywords: ['suno'] },
  { id: 'elevenlabs', name: 'ElevenLabs', logoKey: 'elevenlabs', keywords: ['eleven', 'elevenlabs'] },
  { id: 'topaz', name: 'Topaz 超分', logoKey: 'topaz', keywords: ['topaz', 'upscale'] },
  { id: 'meshy', name: 'Meshy', logoKey: 'meshy', keywords: ['meshy'] },
  { id: 'fal', name: 'Fal.ai', logoKey: 'fal', keywords: ['fal-ai', 'fal.ai', 'fal'] },
  { id: 'siliconflow', name: '硅基流动', logoKey: 'siliconflow', keywords: ['siliconflow', 'siliconcloud', 'silicon'] },
  { id: 'together', name: 'Together', logoKey: 'together', keywords: ['together'] },
  { id: 'groq', name: 'Groq', logoKey: 'groq', keywords: ['groq'] },
  { id: 'cohere', name: 'Cohere', logoKey: 'cohere', keywords: ['cohere', 'command-r'] },
  { id: 'openrouter', name: 'OpenRouter', logoKey: 'openrouter', keywords: ['openrouter'] },
];

export const MODALITY_VENDORS_BY_KIND: Record<ModalityKind, ModalityVendorOption[]> = {
  chat: [
    { id: 'openai', name: 'OpenAI', logoKey: 'openai', keywords: ['gpt', 'openai', 'chatgpt', 'dall-e', 'dalle'] },
    { id: 'google', name: 'Google', logoKey: 'google', keywords: ['gemini', 'gemma', 'google', 'imagen', 'palm', 'omni_flash'] },
    { id: 'anthropic', name: 'Anthropic', logoKey: 'claude', keywords: ['claude', 'anthropic'] },
    { id: 'xai', name: 'xAI', logoKey: 'grok', keywords: ['grok', 'xai'] },
    { id: 'deepseek', name: 'DeepSeek', logoKey: 'deepseek', keywords: ['deepseek'] },
    { id: 'moonshot', name: 'Moonshot', logoKey: 'moonshot', keywords: ['moonshot', 'kimi'] },
    { id: 'minimax', name: 'MiniMax', logoKey: 'minimax', keywords: ['minimax', 'abab'] },
    { id: 'glm', name: 'GLM', logoKey: 'zhipu', keywords: ['glm', 'zhipu', 'chatglm'] },
    { id: 'qwen', name: 'Qwen', logoKey: 'qwen', keywords: ['qwen', 'tongyi', 'cosyvoice'] },
    { id: 'bytedance', name: '字节', logoKey: 'bytedance', keywords: ['doubao', 'jimeng', 'bytedance', 'volc', 'skylark', 'seedream', 'seedance'] },
    { id: 'xiaomi', name: '小米', logoKey: 'xiaomi', keywords: ['xiaomi', 'mimo'] },
    { id: 'yi', name: '零一万物', logoKey: 'yi', keywords: ['yi-', 'yi_', '01.ai', '01ai', '01-ai', 'yi-lightning', 'yi-large'] },
    { id: 'baidu', name: '百度文心', logoKey: 'baidu', keywords: ['ernie', 'baidu', 'wenxin', '文心'] },
    { id: 'baichuan', name: '百川智能', logoKey: 'baichuan', keywords: ['baichuan', '百川'] },
    { id: 'stepfun', name: '阶跃星辰', logoKey: 'stepfun', keywords: ['stepfun', 'step-', 'step_'] },
    { id: 'sensenova', name: '商汤', logoKey: 'sensenova', keywords: ['sensenova', 'sensechat', 'internlm', 'internvl', '商汤'] },
    { id: 'mistral', name: 'Mistral', logoKey: 'mistral', keywords: ['mistral', 'pixtral'] },
  ],
  image: [
    { id: 'openai', name: 'OpenAI', logoKey: 'openai', keywords: ['gpt-image', 'dall', 'openai', 'gpt'] },
    { id: 'google', name: 'Google', logoKey: 'google', keywords: ['imagen', 'gemini', 'banana', 'google'] },
    { id: 'flux', name: 'Flux', logoKey: 'flux', keywords: ['flux', 'bfl'] },
    { id: 'meta', name: 'Meta', logoKey: 'meta', keywords: ['llama', 'meta'] },
    { id: 'midjourney', name: 'MJ', logoKey: 'midjourney', keywords: ['midjourney', 'niji'] },
    { id: 'bytedance', name: '字节', logoKey: 'bytedance', keywords: ['seedream', 'jimeng', 'doubao', 'bytedance'] },
    { id: 'xai', name: 'xAI', logoKey: 'grok', keywords: ['grok', 'xai'] },
    { id: 'kling', name: 'Kling', logoKey: 'kling', keywords: ['kling', 'kolors'] },
    { id: 'qwen', name: 'Qwen', logoKey: 'qwen', keywords: ['qwen', 'wanx', 'wan', 'z-image'] },
    { id: 'glm', name: 'GLM', logoKey: 'zhipu', keywords: ['glm', 'zhipu', 'cogview'] },
    { id: 'recraft', name: 'Recraft', logoKey: 'recraft', keywords: ['recraft'] },
  ],
  video: [
    { id: 'bytedance', name: '字节', logoKey: 'bytedance', keywords: ['seedance', 'doubao', 'jimeng', 'bytedance', 'volc'] },
    { id: 'openai', name: 'OpenAI', logoKey: 'sora', keywords: ['sora', 'openai'] },
    { id: 'google', name: 'Google', logoKey: 'google', keywords: ['veo', 'gemini', 'google'] },
    { id: 'flux', name: 'Flux', logoKey: 'flux', keywords: ['flux', 'bfl'] },
    { id: 'xai', name: 'xAI', logoKey: 'grok', keywords: ['grok', 'xai'] },
    { id: 'minimax', name: 'MiniMax', logoKey: 'minimax', keywords: ['minimax', 'hailuo', 'video-01'] },
    { id: 'qwen', name: 'Qwen', logoKey: 'qwen', keywords: ['wan', 'qwen'] },
    { id: 'kling', name: 'Kling', logoKey: 'kling', keywords: ['kling'] },
    { id: 'vidu', name: 'Vidu', logoKey: 'vidu', keywords: ['vidu', 'shengshu'] },
    { id: 'luma', name: 'Luma', logoKey: 'luma', keywords: ['luma', 'dream-machine'] },
    { id: 'runway', name: 'Runway', logoKey: 'runway', keywords: ['runway', 'gen-2', 'gen-3', 'gen2', 'gen3'] },
    { id: 'pika', name: 'Pika', logoKey: 'pika', keywords: ['pika'] },
    { id: 'midjourney', name: 'MJ', logoKey: 'midjourney', keywords: ['midjourney', 'niji'] },
    { id: 'topaz', name: 'Topaz 超分', logoKey: 'topaz', keywords: ['topaz', 'upscale'] },
  ],
  three_d: [
    { id: 'hunyuan', name: 'Hunyuan', logoKey: 'hunyuan', keywords: ['hunyuan', 'fal-ai/hunyuan'] },
    { id: 'tripo', name: 'Tripo', logoKey: 'tripo', keywords: ['tripo'] },
    { id: 'meshy', name: 'Meshy', logoKey: 'meshy', keywords: ['meshy'] },
  ],
  music: [
    { id: 'suno', name: 'Suno', logoKey: 'suno', keywords: ['suno', 'chirp'] },
    { id: 'elevenlabs', name: 'ElevenLabs', logoKey: 'elevenlabs', keywords: ['eleven', 'elevenlabs'] },
    { id: 'minimax', name: 'MiniMax', logoKey: 'minimax', keywords: ['minimax', 'music'] },
    { id: 'stability', name: 'Stability', logoKey: 'flux', keywords: ['stable-audio', 'stability'] },
  ],
  voice: [
    { id: 'qwen', name: 'Qwen', logoKey: 'qwen', keywords: ['qwen', 'cosyvoice'] },
    { id: 'minimax', name: 'MiniMax', logoKey: 'minimax', keywords: ['minimax', 'speech', 't2a'] },
    { id: 'elevenlabs', name: 'ElevenLabs', logoKey: 'elevenlabs', keywords: ['eleven', 'elevenlabs'] },
    { id: 'bytedance', name: '字节', logoKey: 'bytedance', keywords: ['doubao', 'bytedance', 'volc', 'seed-tts'] },
    { id: 'openai', name: 'OpenAI', logoKey: 'openai', keywords: ['openai', 'tts'] },
    { id: 'xai', name: 'xAI', logoKey: 'grok', keywords: ['grok', 'xai'] },
    { id: 'google', name: 'Google', logoKey: 'google', keywords: ['gemini', 'google'] },
  ],
  avatar: [
    { id: 'kling', name: '可灵', logoKey: 'kling', keywords: ['kling-lip', 'kling-avatar', 'kling-ident', 'kling', 'keling'] },
    { id: 'bytedance', name: '字节', logoKey: 'bytedance', keywords: ['omnihuman', 'omni-human', 'jimeng', 'doubao'] },
    { id: 'qwen', name: '万相', logoKey: 'qwen', keywords: ['wanx-avatar', 'videoretalk', 'wan2.2-s2v', 'emo-detect', 'emo-v', 'wanx'] },
    { id: 'hedra', name: 'Hedra', logoKey: 'hedra', keywords: ['hedra'] },
    { id: 'fal', name: 'LatentSync', logoKey: 'fal', keywords: ['latentsync', 'musetalk', 'lip-sync', 'lipsync', 'digital-human'] },
  ],
};

const LEGACY_VENDOR_IDS: Record<string, string> = {
  gemini: 'google',
  claude: 'anthropic',
  grok: 'xai',
  kimi: 'moonshot',
  zhipu: 'glm',
  doubao: 'bytedance',
  jimeng: 'bytedance',
  sora: 'openai',
  cosyvoice: 'qwen',
  dashscope: 'qwen',
  kuaishou: 'kling',
  shengshu: 'vidu',
  'fal-ai': 'fal',
  siliconcloud: 'siliconflow',
};

function keywordHit(haystack: string, keyword: string): boolean {
  const key = keyword.toLowerCase();
  if (!key) return false;
  if (key.length <= 2) {
    return new RegExp(`(?:^|[^a-z0-9])${key}(?:[^a-z0-9]|$)`).test(haystack);
  }
  return haystack.includes(key);
}

function matchBestVendor(haystack: string, candidates: ModalityVendorOption[]): { id: string; length: number } {
  let bestId = '';
  let bestLength = 0;
  for (const vendor of candidates) {
    for (const keyword of vendor.keywords) {
      if (keywordHit(haystack, keyword) && keyword.length > bestLength) {
        bestLength = keyword.length;
        bestId = vendor.id;
      }
    }
  }
  return { id: bestId, length: bestLength };
}

export function inferVendorFromModelId(rawModelId: string, kind?: ModalityKind): string {
  // 剥离常见的平台包装前缀，如 fal-ai/, net- 等，确保识别底层厂商
  const cleaned = rawModelId.toLowerCase().replace(/^(?:net-|fal-ai\/|openai\/)/, '');
  if (kind && MODALITY_VENDORS_BY_KIND[kind]) {
    const localMatch = matchBestVendor(cleaned, MODALITY_VENDORS_BY_KIND[kind]);
    if (localMatch.id) return localMatch.id;
  }
  const globalMatch = matchBestVendor(cleaned, GLOBAL_ALL_VENDORS);
  return globalMatch.id;
}

export function vendorOption(kind: ModalityKind, vendorId: string): ModalityVendorOption | undefined {
  const local = (MODALITY_VENDORS_BY_KIND[kind] || []).find((vendor) => vendor.id === vendorId);
  if (local) return local;
  return GLOBAL_ALL_VENDORS.find((vendor) => vendor.id === vendorId);
}

export function modelMatchesVendor(
  model: Pick<ModalityModelItem, 'vendor' | 'modelId' | 'name'>,
  vendor: ModalityVendorOption,
): boolean {
  if (model.vendor === vendor.id) return true;
  if (LEGACY_VENDOR_IDS[model.vendor] === vendor.id) return true;
  const haystack = `${model.vendor} ${model.modelId} ${model.name}`.toLowerCase();
  return vendor.keywords.some((keyword) => keywordHit(haystack, keyword));
}

export function normalizeModelVendor(kind: ModalityKind, model: ModalityModelItem): ModalityModelItem {
  const vendors = MODALITY_VENDORS_BY_KIND[kind] || [];
  if (vendors.some((vendor) => vendor.id === model.vendor)) return model;
  const alias = LEGACY_VENDOR_IDS[model.vendor];
  if (alias && vendors.some((vendor) => vendor.id === alias)) {
    return { ...model, vendor: alias };
  }
  const inferred = inferVendorFromModelId(`${model.modelId} ${model.name}`, kind);
  if (inferred) return { ...model, vendor: inferred };
  return model;
}

export function isModelMatchModality(rawModelId: string, kind: ModalityKind): boolean {
  return classifyModel(rawModelId) === kind;
}

export interface ModelVersionScore {
  major: number;
  minor: number;
  dateScore: number;
  tierScore: number;
}

export function extractModelVersionScore(rawModelId: string): ModelVersionScore {
  const lower = rawModelId.toLowerCase().trim();

  // 1. 提取发布日期（YYYY-MM-DD 或 YYYYMMDD），日期越新排在越前
  let dateScore = 0;
  const dateHyphenMatch = lower.match(/(202[4-9])-([01]\d)-([0-3]\d)/);
  if (dateHyphenMatch) {
    dateScore = parseInt(dateHyphenMatch[1] + dateHyphenMatch[2] + dateHyphenMatch[3], 10);
  } else {
    const dateNumMatch = lower.match(/(202[4-9][01]\d[0-3]\d)/);
    if (dateNumMatch) {
      dateScore = parseInt(dateNumMatch[1], 10);
    }
  }

  // 2. 提取代次主次版本号
  let major = 0;
  let minor = 0;

  // 特殊系列优先：GPT-4o 视为主版本 4.5
  if (lower.includes('gpt-4o')) {
    major = 4;
    minor = 50;
  } else {
    // 匹配主流厂商前缀紧随的版本数字（如 gpt-6.1, gemini-3.7, claude-3-7, qwen2.5 等）
    const versionMatch = lower.match(
      /(?:gpt-|gemini-|claude-|qwen|seedream-|seedance-|kling-v?|flux-|veo-|sora-?|midjourney-v?|v)(\d+)(?:[-._](\d+))?/i,
    );
    if (versionMatch) {
      major = parseInt(versionMatch[1], 10) || 0;
      minor = versionMatch[2] ? parseInt(versionMatch[2], 10) : 0;
      if (minor >= 100) minor = Math.floor(minor / 10);
    } else {
      // 通用回退：寻找任何独立的 X.Y 或 X-Y 版本
      const fallbackMatch = lower.match(/(?:^|[^a-z0-9])(\d+)[._-](\d+)(?:[^a-z0-9]|$)/);
      if (fallbackMatch && parseInt(fallbackMatch[1], 10) < 2000) {
        major = parseInt(fallbackMatch[1], 10);
        minor = parseInt(fallbackMatch[2], 10);
      }
    }
  }

  // 3. 旗舰/算力等级微调权重（sol > luna > astra/terra > pro/max/ultra > 普通 > mini/lite/flash）
  let tierScore = 50;
  if (/sol/i.test(lower)) tierScore += 12;
  else if (/luna/i.test(lower)) tierScore += 10;
  else if (/astra|terra/i.test(lower)) tierScore += 8;

  if (/(pro|max|ultra|plus)/i.test(lower)) tierScore += 4;
  if (/(flash|mini|lite|flex|minimal)/i.test(lower)) tierScore -= 4;

  return { major, minor, dateScore, tierScore };
}

/**
 * 按照模型版本从新到老（降序）进行比较排序：
 * 优先比较主版本号 -> 次版本号 -> 发布日期 -> 旗舰级别权重 -> 稳定字母降序
 */
export function compareModelVersionsDesc(aId: string, bId: string): number {
  const a = extractModelVersionScore(aId);
  const b = extractModelVersionScore(bId);

  // 主版本降序
  if (a.major !== b.major) return b.major - a.major;
  // 次版本降序
  if (a.minor !== b.minor) return b.minor - a.minor;
  // 发布日期降序（新日期优先）
  if (a.dateScore !== b.dateScore) return b.dateScore - a.dateScore;
  // 旗舰权重降序
  if (a.tierScore !== b.tierScore) return b.tierScore - a.tierScore;

  // 兜底字典序稳定降序
  return bId.localeCompare(aId);
}
