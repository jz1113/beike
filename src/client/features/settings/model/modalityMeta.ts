import { canonicalModelId } from '@shared/domain/models/modelCatalog';
import { APPROVED_VIDEO_MODELS } from '@shared/domain/models/model-catalog/approvedVideo';
import { classifyModel, normalizeModelId, type ModalityKind, type ModalityModelItem, type ModalityVendorOption } from './modalityClassifier';

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
  voice: {
    title: '语音',
    subtitle: '高保真文本转语音、克隆声音与智能配音模型。',
  },
};

export const GLOBAL_ALL_VENDORS: ModalityVendorOption[] = [
  { id: 'google', name: 'Google', logoKey: 'gemini', keywords: ['gemini', 'gemma', 'google', 'imagen', 'palm', 'veo', 'banana', 'omni_flash'] },
  { id: 'openai', name: 'OpenAI', logoKey: 'openai', keywords: ['gpt', 'openai', 'chatgpt', 'dall', 'sora'] },
  { id: 'anthropic', name: 'Anthropic', logoKey: 'claude', keywords: ['claude', 'anthropic'] },
  { id: 'xai', name: 'xAI', logoKey: 'grok', keywords: ['grok', 'xai'] },
  { id: 'deepseek', name: 'DeepSeek', logoKey: 'deepseek', keywords: ['deepseek'] },
  { id: 'moonshot', name: 'Moonshot', logoKey: 'kimi', keywords: ['moonshot', 'kimi'] },
  { id: 'qwen', name: 'Qwen', logoKey: 'qwen', keywords: ['qwen', 'tongyi', 'cosyvoice', 'wanx', 'wan', 'z-image', 'dashscope'] },
  { id: 'meta', name: 'Meta', logoKey: 'meta', keywords: ['llama', 'meta', 'muse'] },
  { id: 'bytedance', name: '字节', logoKey: 'jimeng', keywords: ['doubao', 'jimeng', 'bytedance', 'volc', 'skylark', 'seedream', 'seedance'] },
  { id: 'flux', name: 'Flux', logoKey: 'flux', keywords: ['flux', 'bfl'] },
  { id: 'minimax', name: 'MiniMax', logoKey: 'minimax', keywords: ['minimax', 'abab', 'hailuo'] },
  { id: 'glm', name: 'GLM', logoKey: 'zhipu', keywords: ['glm', 'zhipu', 'chatglm', 'cogview'] },
  { id: 'kling', name: 'Kling', logoKey: 'kling', keywords: ['kling', 'kolors', 'keling', 'kuaishou'] },
  { id: 'midjourney', name: 'MJ', logoKey: 'midjourney', keywords: ['midjourney', 'niji', 'mj'] },
  { id: 'vidu', name: 'Vidu', logoKey: 'vidu', keywords: ['vidu', 'shengshu'] },
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
  { id: 'elevenlabs', name: 'ElevenLabs', logoKey: 'elevenlabs', keywords: ['eleven', 'elevenlabs'] },
  { id: 'topaz', name: 'Topaz 超分', logoKey: 'topaz', keywords: ['topaz', 'upscale'] },
  { id: 'fal', name: 'Fal.ai', logoKey: 'fal', keywords: ['fal-ai', 'fal.ai', 'fal'] },
  { id: 'siliconflow', name: '硅基流动', logoKey: 'siliconflow', keywords: ['siliconflow', 'siliconcloud', 'silicon'] },
  { id: 'together', name: 'Together', logoKey: 'together', keywords: ['together'] },
  { id: 'groq', name: 'Groq', logoKey: 'groq', keywords: ['groq'] },
  { id: 'cohere', name: 'Cohere', logoKey: 'cohere', keywords: ['cohere', 'command-r'] },
  { id: 'openrouter', name: 'OpenRouter', logoKey: 'openrouter', keywords: ['openrouter'] },
];

export const MODALITY_VENDORS_BY_KIND: Record<ModalityKind, ModalityVendorOption[]> = {
  chat: [
    { id: 'google', name: 'Google', logoKey: 'gemini', keywords: ['gemini', 'gemma', 'google', 'imagen', 'palm', 'omni_flash'] },
    { id: 'openai', name: 'OpenAI', logoKey: 'openai', keywords: ['gpt', 'openai', 'chatgpt', 'dall-e', 'dalle'] },
    { id: 'anthropic', name: 'Anthropic', logoKey: 'claude', keywords: ['claude', 'anthropic'] },
    { id: 'xai', name: 'xAI', logoKey: 'grok', keywords: ['grok', 'xai'] },
    { id: 'deepseek', name: 'DeepSeek', logoKey: 'deepseek', keywords: ['deepseek'] },
    { id: 'moonshot', name: 'Moonshot', logoKey: 'kimi', keywords: ['moonshot', 'kimi'] },
    { id: 'qwen', name: 'Qwen', logoKey: 'qwen', keywords: ['qwen', 'tongyi', 'cosyvoice'] },
    { id: 'meta', name: 'Meta', logoKey: 'meta', keywords: ['llama', 'meta', 'muse'] },
    { id: 'minimax', name: 'MiniMax', logoKey: 'minimax', keywords: ['minimax', 'abab'] },
    { id: 'glm', name: 'GLM', logoKey: 'zhipu', keywords: ['glm', 'zhipu', 'chatglm'] },
    { id: 'bytedance', name: '字节', logoKey: 'jimeng', keywords: ['doubao', 'jimeng', 'bytedance', 'volc', 'skylark', 'seedream', 'seedance'] },
    { id: 'xiaomi', name: '小米', logoKey: 'xiaomi', keywords: ['xiaomi', 'mimo'] },
    { id: 'yi', name: '零一万物', logoKey: 'yi', keywords: ['yi-', 'yi_', '01.ai', '01ai', '01-ai', 'yi-lightning', 'yi-large'] },
    { id: 'baidu', name: '百度文心', logoKey: 'baidu', keywords: ['ernie', 'baidu', 'wenxin', '文心'] },
    { id: 'baichuan', name: '百川智能', logoKey: 'baichuan', keywords: ['baichuan', '百川'] },
    { id: 'stepfun', name: '阶跃星辰', logoKey: 'stepfun', keywords: ['stepfun', 'step-', 'step_'] },
    { id: 'sensenova', name: '商汤', logoKey: 'sensenova', keywords: ['sensenova', 'sensechat', 'internlm', 'internvl', '商汤'] },
    { id: 'mistral', name: 'Mistral', logoKey: 'mistral', keywords: ['mistral', 'pixtral'] },
  ],
  image: [
    { id: 'google', name: 'Google', logoKey: 'gemini', keywords: ['imagen', 'gemini', 'banana', 'google'] },
    { id: 'openai', name: 'OpenAI', logoKey: 'openai', keywords: ['gpt-image', 'dall', 'openai', 'gpt'] },
    { id: 'flux', name: 'Flux', logoKey: 'flux', keywords: ['flux', 'bfl'] },
    { id: 'meta', name: 'Meta', logoKey: 'meta', keywords: ['llama', 'meta', 'muse'] },
    { id: 'midjourney', name: 'MJ', logoKey: 'midjourney', keywords: ['midjourney', 'niji'] },
    { id: 'bytedance', name: '字节', logoKey: 'jimeng', keywords: ['seedream', 'jimeng', 'doubao', 'bytedance'] },
    { id: 'xai', name: 'xAI', logoKey: 'grok', keywords: ['grok', 'xai'] },
    { id: 'kling', name: 'Kling', logoKey: 'kling', keywords: ['kling', 'kolors'] },
    { id: 'qwen', name: 'Qwen', logoKey: 'qwen', keywords: ['qwen', 'wanx', 'wan', 'z-image'] },
    { id: 'glm', name: 'GLM', logoKey: 'zhipu', keywords: ['glm', 'zhipu', 'cogview'] },
    { id: 'recraft', name: 'Recraft', logoKey: 'recraft', keywords: ['recraft'] },
  ],
  video: [
    { id: 'bytedance', name: '字节', logoKey: 'jimeng', keywords: ['seedance', 'doubao', 'jimeng', 'bytedance', 'volc'] },
    { id: 'openai', name: 'OpenAI', logoKey: 'sora', keywords: ['sora', 'openai'] },
    { id: 'google', name: 'Google', logoKey: 'gemini', keywords: ['veo', 'gemini', 'google'] },
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
  voice: [
    { id: 'qwen', name: 'Qwen', logoKey: 'qwen', keywords: ['qwen', 'cosyvoice'] },
    { id: 'minimax', name: 'MiniMax', logoKey: 'minimax', keywords: ['minimax', 'speech', 't2a'] },
    { id: 'elevenlabs', name: 'ElevenLabs', logoKey: 'elevenlabs', keywords: ['eleven', 'elevenlabs'] },
    { id: 'bytedance', name: '字节', logoKey: 'jimeng', keywords: ['doubao', 'bytedance', 'volc', 'seed-tts'] },
    { id: 'openai', name: 'OpenAI', logoKey: 'openai', keywords: ['openai', 'tts'] },
    { id: 'xai', name: 'xAI', logoKey: 'grok', keywords: ['grok', 'xai'] },
    { id: 'google', name: 'Google', logoKey: 'gemini', keywords: ['gemini', 'google'] },
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

// 同步目录的准入规则与已保存模型、官方默认和运行时兼容性分开。
const MULTIMODAL_SYNC_MINIMUMS: Record<string, readonly [RegExp, number, number]> = {
  google: [/^gemini-?(\d{1,2})(?:[._-](\d{1,2}))?(?=-|$)/, 3, 8],
  openai: [/^gpt-?(\d{1,2})(?:[._-](\d{1,2}))?(?=-|$)/, 5, 6],
  anthropic: [/^claude-(?:(?:opus|sonnet|haiku|fable)-)?(\d{1,2})(?:[._-](\d{1,2}))?(?=-|$)/, 4, 8],
  xai: [/^grok-?(\d{1,2})(?:[._-](\d{1,2}))?(?=-|$)/, 4, 6],
  deepseek: [/^deepseek-v?(\d{1,2})(?:[._-](\d{1,2}))?(?=-|$)/, 4, 1],
  moonshot: [/^kimi-k(\d{1,2})(?:[._-](\d{1,2}))?(?=-|$)/, 3, 0],
  qwen: [/^qwen-?(\d{1,2})(?:[._-](\d{1,2}))?(?=-|$)/, 3, 8],
  bytedance: [/^doubao-(?:seed-)?(\d{1,2})(?:[._-](\d{1,2}))?(?=-|$)/, 2, 0],
  minimax: [/^minimax-m(\d{1,2})(?:[._-](\d{1,2}))?(?=-|$)/, 2, 7],
  glm: [/^glm-?(\d{1,2})(?:[._-](\d{1,2}))?(?=-|$)/, 5, 2],
};

const IMAGE_SYNC_MODELS = [
  /^gemini-3[.-]1-flash-image$/,
  /^(?:gemini-)?nano-?banana-?2(?:[.-]1)?$/,
  /^gpt-image-2(?:[.-](?:5|6))?(?:-(?:flare|sunburst))?$/,
  /^grok-4[.-]2-image$/,
  /^(?:doubao-)?seedream-v?(?:4[.-]5|5(?:[.-]0)?(?:-(?:pro|flash))?)(?:-\d{6})?$/,
  /^kling-image-?v?3(?:-omni)?$/,
];

const VIDEO_SYNC_LEGACY = new Set([
  'kling-video-v2-5-turbo',
  'kling-video-v2-6',
]);
const VIDEO_SYNC_MODELS = new Set(
  APPROVED_VIDEO_MODELS.map(({ id }) => id.toLowerCase()).filter((id) => !VIDEO_SYNC_LEGACY.has(id)),
);

export function videoSyncCandidateKey(modelId: string): string {
  return canonicalModelId(modelId.trim().replace(/^net-/i, '')).toLowerCase();
}

const VOICE_SYNC_MODELS = [
  /^speech-(?:2[.-][89]|[3-9](?:[.-]\d+)?)(?:-(?:hd|turbo))?$/,
  /^cosyvoice-v?[3-9](?:[.-]\d+)?(?:-(?:flash|plus|pro))?$/,
  /^eleven-(?:v3|(?:flash|turbo)-v2[.-]5)$/,
  /^gpt-4o-mini-tts$/,
  /^(?:grok-voice|gemini-tts|doubao-tts|seed-tts)$/,
];

export function modalitySyncCandidateKey(modelId: string, kind: ModalityKind): string {
  if (kind === 'video') return videoSyncCandidateKey(modelId);
  if (kind !== 'voice') return modelId;
  return normalizeModelId(modelId.split('/').at(-1) || modelId)
    .replace(/^minimax-(?=speech-)/, '')
    .replace(/^cosy-voice-?/, 'cosyvoice-')
    .replace(/^elevenlabs-(?=v3$|flash-|turbo-)/, 'eleven-')
    .replace(/^((?:speech|cosyvoice|eleven-(?:flash|turbo))-v?\d+)-(\d)(?=-|$)/, '$1.$2');
}

export function isModalitySyncCandidate(rawModelId: string, kind: ModalityKind): boolean {
  if (kind === 'video') return VIDEO_SYNC_MODELS.has(videoSyncCandidateKey(rawModelId));
  if (kind === 'voice') return VOICE_SYNC_MODELS.some((pattern) => pattern.test(modalitySyncCandidateKey(rawModelId, kind)));
  // 部分渠道用厂商命名空间包装模型 ID。
  const id = normalizeModelId(rawModelId.split('/').at(-1) || rawModelId);
  if (kind === 'image') return IMAGE_SYNC_MODELS.some((pattern) => pattern.test(id));

  const vendor = inferVendorFromModelId(rawModelId, kind);
  if (!vendor || vendor === 'mistral') return false;
  const minimum = MULTIMODAL_SYNC_MINIMUMS[vendor];
  if (!minimum) return isModelMatchModality(rawModelId, kind);

  const modelClass = classifyModel(id);
  if (modelClass !== 'chat' && modelClass !== 'unknown') return false;

  const [pattern, minimumMajor, minimumMinor] = minimum;
  const match = id.match(pattern);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2] || 0);
  if (vendor === 'anthropic' && /(?:^|-)thinking(?:-|$)/.test(id)) return false;
  const filtersGeminiReasoning = vendor === 'google' && (major === 4 || (major === 3 && minor === 8));
  if (filtersGeminiReasoning && /(?:^|-)(?:low|medium|high)(?:-|$)/.test(id)) return false;
  // 渠道把 Grok 4.2 的别名标为 4.20，截图要求同时排除。
  if (vendor === 'xai' && major === 4 && minor === 20) return false;
  return major > minimumMajor || (major === minimumMajor && minor >= minimumMinor);
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
