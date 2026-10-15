import type { ModalityKind, ModalityModelItem, ModalityVendorOption } from './modalityModelTypes';

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
  { id: 'hunyuan', name: '混元', logoKey: 'hunyuan', keywords: ['hunyuan'] },
  { id: 'tripo', name: 'Tripo', logoKey: 'tripo', keywords: ['tripo'] },
  { id: 'suno', name: 'Suno', logoKey: 'suno', keywords: ['suno'] },
  { id: 'elevenlabs', name: 'ElevenLabs', logoKey: 'elevenlabs', keywords: ['eleven', 'elevenlabs'] },
  { id: 'topaz', name: 'Topaz 超分', logoKey: 'topaz', keywords: ['topaz', 'upscale'] },
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
    { id: 'midjourney', name: 'MJ', logoKey: 'midjourney', keywords: ['midjourney', 'niji'] },
    { id: 'topaz', name: 'Topaz 超分', logoKey: 'topaz', keywords: ['topaz', 'upscale'] },
  ],
  three_d: [
    { id: 'hunyuan', name: 'Hunyuan', logoKey: 'hunyuan', keywords: ['hunyuan', 'fal-ai/hunyuan'] },
    { id: 'tripo', name: 'Tripo', logoKey: 'tripo', keywords: ['tripo'] },
  ],
  music: [
    { id: 'suno', name: 'Suno', logoKey: 'suno', keywords: ['suno'] },
    { id: 'elevenlabs', name: 'ElevenLabs', logoKey: 'elevenlabs', keywords: ['eleven', 'elevenlabs'] },
    { id: 'minimax', name: 'MiniMax', logoKey: 'minimax', keywords: ['minimax', 'music'] },
  ],
  voice: [
    { id: 'minimax', name: 'MiniMax', logoKey: 'minimax', keywords: ['minimax', 'speech', 't2a'] },
    { id: 'xai', name: 'xAI', logoKey: 'grok', keywords: ['grok', 'xai'] },
    { id: 'qwen', name: 'Qwen', logoKey: 'qwen', keywords: ['qwen', 'cosyvoice'] },
    { id: 'google', name: 'Google', logoKey: 'google', keywords: ['gemini', 'google'] },
    { id: 'bytedance', name: '字节', logoKey: 'bytedance', keywords: ['doubao', 'bytedance', 'volc', 'seed-tts'] },
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
  const haystack = rawModelId.toLowerCase();
  if (kind && MODALITY_VENDORS_BY_KIND[kind]) {
    const localMatch = matchBestVendor(haystack, MODALITY_VENDORS_BY_KIND[kind]);
    if (localMatch.id) return localMatch.id;
  }
  const globalMatch = matchBestVendor(haystack, GLOBAL_ALL_VENDORS);
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
  const id = rawModelId.toLowerCase();
  const isVideo = /(video|sora|veo|kling|runway|gen-?[23]|luma|dream-machine|seedance|vidu|pika|hailuo|wan-?video|flux.*video|topaz|upscale)/i.test(id);
  const isVoice = /(tts|voice|speech|audio|cosyvoice|whisper)/i.test(id);
  const isMusic = /(music|suno|udio|song|melody|elevenlabs|eleven)/i.test(id);
  const is3D = /(3d|mesh|tripo|hunyuan-3d|rodin|meshy|point-e|shap-e)/i.test(id);
  const isImage = /(image|dall|stable-diffusion|midjourney|niji|recraft|ideogram|banana|seedream|wanx|imagen|kolors|flux|z-image)/i.test(id);

  if (kind === 'image') return isImage && !isVideo && !isVoice && !isMusic && !is3D;
  if (kind === 'video') return isVideo && !isVoice && !isMusic;
  if (kind === 'voice') return isVoice && !isMusic;
  if (kind === 'music') return isMusic;
  if (kind === 'three_d') return is3D;
  if (kind === 'chat') return !(isImage || isVideo || isVoice || isMusic || is3D);
  return true;
}
