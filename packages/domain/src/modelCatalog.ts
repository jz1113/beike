/**
 * 贝壳云图批准模型清单——生图 / 生视频 / 多模态的唯一真相源。
 * 网关拉取、提交校验、设置页预设、展示名均从此派生，禁止再各自硬编码一份。
 */

export type ModelCapability = 'image' | 'video' | 'multimodal';

export type ModelVendorId =
  | 'openai'
  | 'google'
  | 'bytedance'
  | 'alibaba'
  | 'midjourney'
  | 'bfl'
  | 'kuaishou'
  | 'xai'
  | 'minimax'
  | 'anthropic'
  | 'deepseek'
  | 'moonshot'
  | 'vidu';

export type VideoAudioSupportType = 'controllable' | 'default_off' | 'prompt_controlled';

export interface ApprovedModel {
  id: string;
  capability: ModelCapability;
  vendor: ModelVendorId;
  name: string;
  shortName: string;
  adapter: string;
  docs: string;
  badge?: string;
  description?: string;
  isPrimary?: boolean;
  isThinking?: boolean;
  supportedQualities?: Array<'high' | 'medium' | 'low'>;
  defaultSize?: string;
  supportEdits?: boolean;
  supportedDurations?: number[];
  supportedResolutions?: Array<'480P' | '720P' | '1080P' | '4K'>;
  supportedAspectRatios?: string[];
  audioSupport?: VideoAudioSupportType;
}

function rangeDurations(min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = min; i <= max; i += 1) out.push(i);
  return out;
}

const IMAGE_QUALITIES = ['high', 'medium', 'low'] as const;
const VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];

export const DEFAULT_IMAGE_MODEL_ID = 'gpt-image-2';
export const DEFAULT_VIDEO_MODEL_ID = 'doubao-seedance-2.0-mini';
export const DEFAULT_MULTIMODAL_MODEL_ID = 'gpt-5.6-luna';
export const DEFAULT_ASSISTANT_MODEL_ID = 'gemini-3.7-flash';

export const APPROVED_MODELS: readonly ApprovedModel[] = [
  // —— 生图 ——
  {
    id: 'gpt-image-2.5-flare',
    capability: 'image',
    vendor: 'openai',
    name: 'GPT Image 2.5 Flare',
    shortName: 'GPT Image 2.5 Flare',
    adapter: 'openai-dalle',
    docs: 'docs/vendors/官方接口/aggregator/openai/gpt-image-2.5-flare.md',
    badge: '2.5 旗舰',
    description: 'OpenAI 新一代生图，支持 low/medium/high 与参考图编辑',
    isPrimary: true,
    supportedQualities: [...IMAGE_QUALITIES],
    defaultSize: '1024x1024',
    supportEdits: true,
  },
  {
    id: 'openai/gpt-image-2',
    capability: 'image',
    vendor: 'openai',
    name: '联池image2',
    shortName: '联池image2',
    adapter: 'openai-dalle',
    docs: 'docs/vendors/官方接口/aggregator/openai/gpt-image-2.md',
    description: '联池 OpenAI 兼容图像接口，支持文生图与多参考图编辑',
    supportedQualities: [...IMAGE_QUALITIES],
    defaultSize: '1024x1024',
    supportEdits: true,
  },
  {
    id: 'gpt-image-2.5-sunburst',
    capability: 'image',
    vendor: 'openai',
    name: 'GPT Image 2.5 Sunburst',
    shortName: 'GPT Image 2.5 Sunburst',
    adapter: 'openai-dalle',
    docs: 'docs/vendors/官方接口/aggregator/openai/gpt-image-2.5-sunburst.md',
    badge: '2.5',
    description: 'OpenAI 2.5 生图通道，尺寸约束与 Flare 相同',
    supportedQualities: [...IMAGE_QUALITIES],
    defaultSize: '1024x1024',
    supportEdits: true,
  },
  {
    id: 'gpt-image-2',
    capability: 'image',
    vendor: 'openai',
    name: 'GPT Image 2',
    shortName: 'GPT Image 2',
    adapter: 'openai-dalle',
    docs: 'docs/vendors/官方接口/aggregator/openai/gpt-image-2.md',
    badge: '4K标准',
    description: 'OpenAI 官方文档标准通道，支持 low/medium/high 画质与参考图编辑',
    isPrimary: true,
    supportedQualities: [...IMAGE_QUALITIES],
    defaultSize: '1024x1536',
    supportEdits: true,
  },
  {
    id: 'nano-banana-pro',
    capability: 'image',
    vendor: 'google',
    name: 'Nano Banana Pro',
    shortName: 'Nano Banana Pro',
    adapter: 'gemini-nano',
    docs: 'docs/vendors/官方接口/aggregator/google/nano-banana-pro.md',
    badge: 'Pro',
    description: 'Google Gemini 系高质量多参考图生图',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2048x2048',
    supportEdits: true,
  },
  {
    id: 'nano-banana',
    capability: 'image',
    vendor: 'google',
    name: 'Nano Banana',
    shortName: 'Nano Banana',
    adapter: 'gemini-nano',
    docs: 'docs/vendors/官方接口/aggregator/google/nano-banana.md',
    badge: '极速',
    description: 'Google Gemini 系极速多参考图生图',
    supportedQualities: ['high', 'medium'],
    defaultSize: '1024x1024',
    supportEdits: true,
  },
  {
    id: 'doubao-seedream-4-0-250828',
    capability: 'image',
    vendor: 'bytedance',
    name: 'Seedream 4.0',
    shortName: 'Seedream 4.0',
    adapter: 'seedream',
    docs: 'docs/vendors/官方接口/aggregator/volcengine/doubao-seedream-4-0-250828.md',
    badge: '4.0',
    description: '火山引擎即梦 4.0 生图',
    supportedQualities: [...IMAGE_QUALITIES],
    defaultSize: '2048x2048',
    supportEdits: true,
  },
  {
    id: 'doubao-seedream-4-5-251128',
    capability: 'image',
    vendor: 'bytedance',
    name: 'Seedream 4.5',
    shortName: 'Seedream 4.5',
    adapter: 'seedream',
    docs: 'docs/vendors/官方接口/aggregator/volcengine/doubao-seedream-4-5-251128.md',
    badge: '4.5',
    description: '火山引擎即梦 4.5 生图',
    supportedQualities: [...IMAGE_QUALITIES],
    defaultSize: '2048x2048',
    supportEdits: true,
  },
  {
    id: 'doubao-seedream-5-0-260128',
    capability: 'image',
    vendor: 'bytedance',
    name: 'Seedream 5.0',
    shortName: 'Seedream 5.0',
    adapter: 'seedream',
    docs: 'docs/vendors/官方接口/aggregator/volcengine/doubao-seedream-5-0-260128.md',
    badge: '电商旗舰',
    description: '火山引擎官方电商生成旗舰模型',
    isPrimary: true,
    supportedQualities: ['high', 'medium'],
    defaultSize: '2048x2048',
    supportEdits: true,
  },
  {
    id: 'seedream-v5-pro',
    capability: 'image',
    vendor: 'bytedance',
    name: 'Seedream V5 Pro',
    shortName: 'Seedream V5 Pro',
    adapter: 'seedream',
    docs: 'docs/vendors/官方接口/aggregator/volcengine/seedream-v5-pro.md',
    badge: 'V5 Pro',
    description: '即梦 V5 Pro，已验证 1K～2K 尺寸',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2048x2048',
    supportEdits: true,
  },
  {
    id: 'qwen-image-max',
    capability: 'image',
    vendor: 'alibaba',
    name: 'Qwen Image Max',
    shortName: 'Qwen Image Max',
    adapter: 'openai-dalle',
    docs: 'docs/vendors/官方接口/aggregator/alibaba/qwen-image-max.md',
    badge: 'Max',
    description: '通义千问图像生成 Max（网关真实 id；原清单 qwen-image-3 无对应条目）',
    supportedQualities: ['high', 'medium'],
    defaultSize: '1024x1024',
    supportEdits: true,
  },
  {
    id: 'z-image-turbo',
    capability: 'image',
    vendor: 'alibaba',
    name: 'Z-Image Turbo',
    shortName: 'Z-Image Turbo',
    adapter: 'openai-dalle',
    docs: 'docs/vendors/官方接口/aggregator/alibaba/z-image-turbo.md',
    badge: '极速',
    description: '阿里极速生图通道',
    supportedQualities: ['medium', 'low'],
    defaultSize: '1024x1024',
    supportEdits: false,
  },
  {
    id: 'qwen-image',
    capability: 'image',
    vendor: 'alibaba',
    name: 'Qwen Image',
    shortName: 'Qwen Image',
    adapter: 'openai-dalle',
    docs: 'docs/vendors/官方接口/aggregator/alibaba/qwen-image.md',
    badge: '文生图',
    description: '通义千问文生图',
    supportedQualities: ['high', 'medium'],
    defaultSize: '1024x1024',
    supportEdits: false,
  },
  {
    id: 'qwen-image-edit',
    capability: 'image',
    vendor: 'alibaba',
    name: 'Qwen Image Edit',
    shortName: 'Qwen Edit',
    adapter: 'qwen-edit',
    docs: 'docs/vendors/官方接口/aggregator/alibaba/qwen-image-edit.md',
    badge: '图编辑',
    description: '通义千问图像编辑，仅支持一张参考图',
    supportedQualities: ['high', 'medium'],
    defaultSize: '1024x1024',
    supportEdits: true,
  },
  {
    id: 'midjourney',
    capability: 'image',
    vendor: 'midjourney',
    name: 'Midjourney',
    shortName: 'Midjourney',
    adapter: 'midjourney',
    docs: 'docs/vendors/官方接口/aggregator/midjourney/midjourney.md',
    badge: 'Imagine',
    description: '网关模型 id 为 midjourney，适配器提交 mj_fast_imagine',
    supportedQualities: ['high', 'medium'],
    defaultSize: '1024x1024',
    supportEdits: true,
  },
  {
    id: 'flux',
    capability: 'image',
    vendor: 'bfl',
    name: 'Flux',
    shortName: 'Flux',
    adapter: 'flux',
    docs: 'docs/vendors/官方接口/aggregator/bfl/flux.md',
    badge: '基础',
    description: 'Black Forest Labs Flux 文生图',
    supportedQualities: ['high', 'medium'],
    defaultSize: '1024x1024',
    supportEdits: true,
  },
  {
    id: 'flux-pro-max',
    capability: 'image',
    vendor: 'bfl',
    name: 'Flux Pro Max',
    shortName: 'Flux Pro Max',
    adapter: 'flux',
    docs: 'docs/vendors/官方接口/aggregator/bfl/flux-pro-max.md',
    badge: 'Pro Max',
    description: 'Black Forest Labs Flux Pro Max',
    supportedQualities: ['high', 'medium'],
    defaultSize: '2048x2048',
    supportEdits: true,
  },
  {
    id: 'grok-4.1-image',
    capability: 'image',
    vendor: 'xai',
    name: 'Grok 4.1 Image',
    shortName: 'Grok 4.1 Image',
    adapter: 'grok-image',
    docs: 'docs/vendors/官方接口/aggregator/xai/grok-4.1-image.md',
    badge: '写实',
    description: 'xAI Grok 4.1 文生图（aspect_ratio 驱动）',
    supportedQualities: ['medium', 'low'],
    defaultSize: '1024x1536',
    supportEdits: true,
  },
  {
    id: 'grok-4.2-image',
    capability: 'image',
    vendor: 'xai',
    name: 'Grok 4.2 Image',
    shortName: 'Grok 4.2 Image',
    adapter: 'grok-image',
    docs: 'docs/vendors/官方接口/aggregator/xai/grok-4.2-image.md',
    badge: '最新',
    description: 'xAI Grok 4.2 文生图（aspect_ratio 驱动）',
    isPrimary: true,
    supportedQualities: ['medium', 'low'],
    defaultSize: '1024x1536',
    supportEdits: true,
  },
  {
    id: 'grok-imagine-image-quality',
    capability: 'image',
    vendor: 'xai',
    name: 'Grok Imagine Image Quality',
    shortName: 'Grok Imagine Quality',
    adapter: 'grok-image',
    docs: 'docs/vendors/官方接口/aggregator/xai/grok-imagine-image-quality.md',
    badge: '高质',
    description: 'xAI Grok Imagine 高质量生图 / 图像编辑',
    supportedQualities: ['high', 'medium'],
    defaultSize: '1024x1024',
    supportEdits: true,
  },

  // —— 生视频 ——
  {
    id: 'veo3.1',
    capability: 'video',
    vendor: 'google',
    name: 'Veo 3.1',
    shortName: 'Veo 3.1',
    adapter: 'veo',
    docs: 'docs/vendors/官方接口/aggregator/google/veo3.1.md',
    badge: '电影级运镜',
    description: 'DeepMind 旗舰高动态电影画质',
    isPrimary: true,
    supportedDurations: [4, 5, 6, 7, 8],
    supportedResolutions: ['720P', '1080P', '4K'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'controllable',
  },
  {
    id: 'veo3.1-fast',
    capability: 'video',
    vendor: 'google',
    name: 'Veo 3.1 Fast',
    shortName: 'Veo 3.1 Fast',
    adapter: 'veo',
    docs: 'docs/vendors/官方接口/aggregator/google/veo3.1-fast.md',
    badge: '极速',
    description: 'Veo 3.1 极速通道',
    supportedDurations: [4, 5, 6, 7, 8],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'controllable',
  },
  {
    id: 'omni_flash-10s',
    capability: 'video',
    vendor: 'google',
    name: 'Veo Omni Flash 10s',
    shortName: 'Omni Flash',
    adapter: 'veo',
    docs: 'docs/vendors/官方接口/aggregator/google/omni_flash-10s.md',
    badge: '10s',
    description: 'Google Veo Omni Flash 10 秒视频',
    supportedDurations: [10],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    audioSupport: 'controllable',
  },
  {
    id: 'kling-video-v3',
    capability: 'video',
    vendor: 'kuaishou',
    name: 'Kling Video v3',
    shortName: 'Kling v3',
    adapter: 'kling',
    docs: 'docs/vendors/官方接口/aggregator/kling/kling-video-v3.md',
    badge: 'v3',
    description: '快手可灵 v3 文生/图生视频',
    isPrimary: true,
    supportedDurations: [5, 10],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'default_off',
  },
  {
    id: 'kling-video-v3-omni',
    capability: 'video',
    vendor: 'kuaishou',
    name: 'Kling Video v3 Omni',
    shortName: 'Kling v3 Omni',
    adapter: 'kling',
    docs: 'docs/vendors/官方接口/aggregator/kling/kling-video-v3-omni.md',
    badge: 'Omni',
    description: '快手可灵 Omni-Video 多模态视频',
    supportedDurations: [5, 10],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'default_off',
  },
  {
    id: 'kling-video-v2-5-turbo',
    capability: 'video',
    vendor: 'kuaishou',
    name: 'Kling Video v2.5 Turbo',
    shortName: 'Kling v2.5 Turbo',
    adapter: 'kling',
    docs: 'docs/vendors/官方接口/aggregator/kling/kling-video-v2-5-turbo.md',
    badge: 'Turbo',
    description: '快手可灵 v2.5 极速通道',
    supportedDurations: [5, 10],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'default_off',
  },
  {
    id: 'kling-video-v2-6',
    capability: 'video',
    vendor: 'kuaishou',
    name: 'Kling Video v2.6',
    shortName: 'Kling v2.6',
    adapter: 'kling',
    docs: 'docs/vendors/官方接口/aggregator/kling/kling-video-v2-6.md',
    badge: 'v2.6',
    description: '快手可灵 v2.6 视频',
    supportedDurations: [5, 10],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'default_off',
  },
  {
    id: 'doubao-seedance-2-0-260128',
    capability: 'video',
    vendor: 'bytedance',
    name: 'Seedance 2.0',
    shortName: 'Seedance 2.0',
    adapter: 'seedance',
    docs: 'docs/vendors/官方接口/aggregator/volcengine/doubao-seedance-2-0-260128.md',
    badge: '全模态',
    description: '即梦 Seedance 2.0 官方格式',
    supportedDurations: rangeDurations(4, 12),
    supportedResolutions: ['480P', '720P', '1080P', '4K'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'controllable',
  },
  {
    id: 'doubao-seedance-2-0-fast-260128',
    capability: 'video',
    vendor: 'bytedance',
    name: 'Seedance 2.0 Fast',
    shortName: 'Seedance 2.0 Fast',
    adapter: 'seedance',
    docs: 'docs/vendors/官方接口/aggregator/volcengine/doubao-seedance-2-0-fast-260128.md',
    badge: '极速',
    description: '即梦 Seedance 2.0 Fast',
    supportedDurations: rangeDurations(4, 12),
    supportedResolutions: ['480P', '720P', '1080P'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'controllable',
  },
  {
    id: 'doubao-seedance-2.0-mini',
    capability: 'video',
    vendor: 'bytedance',
    name: 'Seedance 2.0 mini',
    shortName: 'Seedance 2.0 mini',
    adapter: 'seedance',
    docs: 'docs/vendors/官方接口/aggregator/volcengine/doubao-seedance-2.0-mini.md',
    badge: '性价比',
    description: '即梦 Seedance 2.0 mini',
    isPrimary: true,
    supportedDurations: rangeDurations(4, 15),
    supportedResolutions: ['480P', '720P', '1080P'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'controllable',
  },
  {
    id: 'doubao-seedance-2.5',
    capability: 'video',
    vendor: 'bytedance',
    name: 'Seedance 2.5',
    shortName: 'Seedance 2.5',
    adapter: 'seedance',
    docs: 'docs/vendors/官方接口/aggregator/volcengine/doubao-seedance-2.5.md',
    badge: '最强模型',
    description: '即梦 Seedance 2.5 旗舰视频',
    isPrimary: true,
    supportedDurations: rangeDurations(4, 15),
    supportedResolutions: ['480P', '720P', '1080P', '4K'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'controllable',
  },
  {
    id: 'sora-2',
    capability: 'video',
    vendor: 'openai',
    name: 'Sora 2',
    shortName: 'Sora 2',
    adapter: 'sora',
    docs: 'docs/vendors/官方接口/aggregator/openai/sora-2.md',
    badge: '物理世界模拟',
    description: 'OpenAI Sora 2 影视级物理世界模型',
    supportedDurations: [10, 15],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    audioSupport: 'prompt_controlled',
  },
  {
    id: 'sora-2-pro',
    capability: 'video',
    vendor: 'openai',
    name: 'Sora 2 Pro',
    shortName: 'Sora 2 Pro',
    adapter: 'sora',
    docs: 'docs/vendors/官方接口/aggregator/openai/sora-2-pro.md',
    badge: '超长高清',
    description: 'OpenAI Sora 2 Pro，最长 25 秒',
    supportedDurations: [10, 15, 25],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    audioSupport: 'prompt_controlled',
  },
  {
    id: 'MiniMax-H3',
    capability: 'video',
    vendor: 'minimax',
    name: 'MiniMax-H3',
    shortName: 'MiniMax-H3',
    adapter: 'minimax',
    docs: 'docs/vendors/官方接口/aggregator/minimax/MiniMax-H3.md',
    badge: '旗舰高动态',
    description: 'MiniMax H3 旗舰视频大模型',
    isPrimary: true,
    supportedDurations: [4, 5, 6, 8, 10, 15],
    supportedResolutions: ['720P', '1080P', '4K'],
    supportedAspectRatios: VIDEO_RATIOS,
    audioSupport: 'prompt_controlled',
  },
  {
    id: 'wan3.0-video',
    capability: 'video',
    vendor: 'alibaba',
    name: '万相 3.0',
    shortName: '万相 3.0',
    adapter: 'wan',
    docs: 'docs/vendors/官方接口/aggregator/alibaba/wan3.0-video.md',
    badge: '新一代旗舰',
    description: '通义万相 3.0，统一文生/图生/参考生视频',
    isPrimary: true,
    supportedDurations: [5, 10, 15, 30],
    supportedResolutions: ['480P', '720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    audioSupport: 'controllable',
  },
  {
    id: 'grok-imagine-video-1.5',
    capability: 'video',
    vendor: 'xai',
    name: 'Grok Imagine Video 1.5',
    shortName: 'Grok Video',
    adapter: 'grok-video',
    docs: 'docs/vendors/官方接口/aggregator/xai/grok-imagine-video-1.5.md',
    badge: '写实动态',
    description: 'xAI Grok Imagine 视频 1.5',
    supportedDurations: [5, 6, 8, 10, 15],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    audioSupport: 'default_off',
  },
  {
    id: 'viduq3',
    capability: 'video',
    vendor: 'vidu',
    name: 'Vidu Q3',
    shortName: 'Vidu Q3',
    adapter: 'vidu',
    docs: 'docs/vendors/官方接口/aggregator/vidu/viduq3.md',
    badge: 'Q3',
    description: '生数 Vidu Q3 文生/图生/参考生视频',
    isPrimary: true,
    supportedDurations: [4, 5, 8],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    audioSupport: 'default_off',
  },
  {
    id: 'viduq3-mix',
    capability: 'video',
    vendor: 'vidu',
    name: 'Vidu Q3 Mix',
    shortName: 'Vidu Q3 Mix',
    adapter: 'vidu',
    docs: 'docs/vendors/官方接口/aggregator/vidu/viduq3-mix.md',
    badge: 'Mix',
    description: '生数 Vidu Q3 Mix',
    supportedDurations: [4, 5, 8],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    audioSupport: 'default_off',
  },
  {
    id: 'viduq3-turbo',
    capability: 'video',
    vendor: 'vidu',
    name: 'Vidu Q3 Turbo',
    shortName: 'Vidu Q3 Turbo',
    adapter: 'vidu',
    docs: 'docs/vendors/官方接口/aggregator/vidu/viduq3-turbo.md',
    badge: 'Turbo',
    description: '生数 Vidu Q3 Turbo',
    supportedDurations: [4, 5, 8],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    audioSupport: 'default_off',
  },
  {
    id: 'viduq3-pro',
    capability: 'video',
    vendor: 'vidu',
    name: 'Vidu Q3 Pro',
    shortName: 'Vidu Q3 Pro',
    adapter: 'vidu',
    docs: 'docs/vendors/官方接口/aggregator/vidu/viduq3-pro.md',
    badge: 'Pro',
    description: '生数 Vidu Q3 Pro',
    supportedDurations: [4, 5, 8],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    audioSupport: 'default_off',
  },

  // —— 多模态 ——
  {
    id: 'gpt-6-astra',
    capability: 'multimodal',
    vendor: 'openai',
    name: 'GPT 6 Astra',
    shortName: 'GPT 6 Astra',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: '多模态',
    description: 'OpenAI GPT 6 Astra 多模态模型',
  },
  {
    id: 'gpt-6-luna',
    capability: 'multimodal',
    vendor: 'openai',
    name: 'GPT 6 Luna',
    shortName: 'GPT 6 Luna',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: '多模态',
    description: 'GPT 6 Luna 多模态模型',
  },
  {
    id: 'grok-4.7',
    capability: 'multimodal',
    vendor: 'xai',
    name: 'Grok 4.7',
    shortName: 'Grok 4.7',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: '多模态',
    description: 'xAI Grok 4.7 多模态',
  },
  {
    id: 'gpt-6-sol',
    capability: 'multimodal',
    vendor: 'openai',
    name: 'GPT 6 Sol',
    shortName: 'GPT 6 Sol',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: '多模态',
    description: 'GPT 6 Sol 多模态模型',
  },
  {
    id: 'gpt-5.6-luna',
    capability: 'multimodal',
    vendor: 'openai',
    name: 'GPT 5.6 Luna',
    shortName: 'GPT 5.6 Luna',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: '多模态',
    description: 'OpenAI 新一代多模态视觉推理',
    isPrimary: true,
  },
  {
    id: 'gpt-5.6-sol',
    capability: 'multimodal',
    vendor: 'openai',
    name: 'GPT 5.6 Sol',
    shortName: 'GPT 5.6 Sol',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: '多模态',
    description: 'OpenAI GPT 5.6 Sol',
  },
  {
    id: 'gpt-5.6',
    capability: 'multimodal',
    vendor: 'openai',
    name: 'GPT 5.6',
    shortName: 'GPT 5.6',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    description: 'OpenAI GPT 5.6 Sol 的官方别名',
  },
  {
    id: 'gpt-5.6-terra',
    capability: 'multimodal',
    vendor: 'openai',
    name: 'GPT 5.6 Terra',
    shortName: 'GPT 5.6 Terra',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: '多模态',
    description: 'OpenAI GPT 5.6 Terra',
  },
  {
    id: 'gpt-5.4-mini',
    capability: 'multimodal',
    vendor: 'openai',
    name: 'GPT 5.4 Mini',
    shortName: 'GPT 5.4 Mini',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: '轻量',
    description: 'OpenAI GPT 5.4 Mini',
  },
  {
    id: 'claude-opus-5',
    capability: 'multimodal',
    vendor: 'anthropic',
    name: 'Claude Opus 5',
    shortName: 'Claude Opus 5',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/claude-messages.md',
    badge: '旗舰推理',
    description: 'Anthropic 顶尖深度推理大模型',
    isPrimary: true,
    isThinking: true,
  },
  {
    id: 'claude-fable-5',
    capability: 'multimodal',
    vendor: 'anthropic',
    name: 'Claude Fable 5',
    shortName: 'Claude Fable 5',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/claude-messages.md',
    badge: '架构专家',
    description: 'Anthropic 高密度结构化推理',
    isThinking: true,
  },
  {
    id: 'claude-opus-4-7',
    capability: 'multimodal',
    vendor: 'anthropic',
    name: 'Claude Opus 4.7',
    shortName: 'Claude Opus 4.7',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/claude-messages.md',
    badge: 'Opus 4.7',
    description: 'Anthropic Claude Opus 4.7',
    isThinking: true,
  },
  {
    id: 'claude-haiku-4-5-20251001-thinking',
    capability: 'multimodal',
    vendor: 'anthropic',
    name: 'Claude Haiku 4.5 Thinking',
    shortName: 'Claude Haiku 4.5',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/claude-messages.md',
    badge: '极速思考',
    description: 'Anthropic Haiku 4.5 思考模式',
    isThinking: true,
  },
  {
    id: 'claude-sonnet-5',
    capability: 'multimodal',
    vendor: 'anthropic',
    name: 'Claude Sonnet 5',
    shortName: 'Claude Sonnet 5',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/claude-messages.md',
    badge: 'Sonnet 5',
    description: 'Anthropic Claude Sonnet 5',
  },
  {
    id: 'gemini-3.8-flash',
    capability: 'multimodal',
    vendor: 'google',
    name: 'Gemini 3.8 Flash',
    shortName: 'Gemini 3.8 Flash',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/gemini.md',
    badge: '极速',
    description: 'Google Gemini 3.8 Flash',
  },
  {
    id: 'gemini-3.7-flash',
    capability: 'multimodal',
    vendor: 'google',
    name: 'Gemini 3.7 Flash',
    shortName: 'Gemini 3.7 Flash',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/gemini.md',
    badge: '助手首选',
    description: 'Google Gemini 3.7 Flash',
    isPrimary: true,
    isThinking: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    capability: 'multimodal',
    vendor: 'google',
    name: 'Gemini 3.1 Pro Preview',
    shortName: 'Gemini 3.1 Pro',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/gemini.md',
    badge: '视觉旗舰',
    description: 'Google Gemini 3.1 Pro 预览',
    isThinking: true,
  },
  {
    id: 'deepseek-v4.1-flash',
    capability: 'multimodal',
    vendor: 'deepseek',
    name: 'DeepSeek V4.1 Flash',
    shortName: 'DeepSeek V4.1 Flash',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: 'V4.1',
    description: 'DeepSeek V4.1 Flash',
  },
  {
    id: 'deepseek-v4-flash',
    capability: 'multimodal',
    vendor: 'deepseek',
    name: 'DeepSeek V4 Flash',
    shortName: 'DeepSeek V4 Flash',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: 'V4',
    description: 'DeepSeek V4 Flash',
  },
  {
    id: 'qwen3.8-max',
    capability: 'multimodal',
    vendor: 'alibaba',
    name: 'Qwen 3.8 Max',
    shortName: 'Qwen 3.8 Max',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: '通义旗舰',
    description: '通义千问 3.8 Max',
  },
  {
    id: 'grok-4.6',
    capability: 'multimodal',
    vendor: 'xai',
    name: 'Grok 4.6',
    shortName: 'Grok 4.6',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: '反AI纪实',
    description: 'xAI Grok 4.6 多模态',
  },
  {
    id: 'kimi-k3',
    capability: 'multimodal',
    vendor: 'moonshot',
    name: 'Kimi K3',
    shortName: 'Kimi K3',
    adapter: 'openai-chat',
    docs: 'docs/vendors/官方接口/aggregator/chat/openai-chat.md',
    badge: 'Kimi',
    description: '月之暗面 Kimi K3',
  },
];

const BY_ID = new Map(APPROVED_MODELS.map((m) => [m.id.toLowerCase(), m]));

const MODEL_ALIASES: Record<string, string> = {
  'qwen-image-3': 'qwen-image-max',
  'qwen-image-edit-2509': 'qwen-image-edit',
  mjv7: 'midjourney',
  'mjv8.1': 'midjourney',
  'mjv8.2': 'midjourney',
};

export function canonicalModelId(id: string): string {
  const trimmed = String(id || '').trim();
  if (!trimmed) return '';
  const slash = trimmed.lastIndexOf('/');
  const stripped = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return MODEL_ALIASES[stripped] || MODEL_ALIASES[stripped.toLowerCase()] || stripped;
}

/**
 * 多模态上游异常时的统一降级顺序。
 *
 * 调用从当前模型在本列表中的位置开始，失败后向后尝试，抵达末尾后回绕。
 * `deepseek-v4.1-flash` 仍可作为用户显式主模型，但不进入自动降级序列，因为
 * 它不在本次确认的优先级名单中。
 */
export const MULTIMODAL_UPSTREAM_FALLBACK_ORDER = [
  'gpt-5.6-luna',
  'grok-4.6',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'deepseek-v4-flash',
  'gpt-5.4-mini',
  'claude-haiku-4-5-20251001-thinking',
  'claude-sonnet-5',
  'gpt-5.6-terra',
  'gemini-3.1-pro-preview',
  'claude-opus-5',
  'claude-opus-4-7',
  'gpt-5.6-sol',
  'qwen3.8-max',
  'kimi-k3',
  'claude-fable-5',
] as const;

/** Builds a circular, de-duplicated fallback chain beginning with the requested model. */
export function buildMultimodalUpstreamFallbackChain(requestedModel?: string): string[] {
  const requested = canonicalModelId(requestedModel || '');
  const start = MULTIMODAL_UPSTREAM_FALLBACK_ORDER.findIndex(
    (model) => model.toLowerCase() === requested.toLowerCase(),
  );
  const ordered = start >= 0
    ? [
        ...MULTIMODAL_UPSTREAM_FALLBACK_ORDER.slice(start),
        ...MULTIMODAL_UPSTREAM_FALLBACK_ORDER.slice(0, start),
      ]
    : [...MULTIMODAL_UPSTREAM_FALLBACK_ORDER];

  return Array.from(new Set([requested, ...ordered].filter(Boolean)));
}

export function getApprovedModel(id: string): ApprovedModel | undefined {
  const canonical = canonicalModelId(id);
  if (!canonical) return undefined;
  return BY_ID.get(id.trim().toLowerCase()) || BY_ID.get(canonical.toLowerCase());
}

export function isApprovedModel(id: string, cap?: ModelCapability): boolean {
  const found = getApprovedModel(id);
  if (!found) return false;
  return cap ? found.capability === cap : true;
}

export function filterApprovedModels<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const approved = getApprovedModel(item.id);
    if (!approved) continue;
    const key = approved.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, id: approved.id });
  }
  return out;
}

export function listApprovedModels(cap?: ModelCapability): ApprovedModel[] {
  return APPROVED_MODELS.filter((m) => (cap ? m.capability === cap : true));
}

export function approvedModelDisplayName(id: string): string | undefined {
  return getApprovedModel(id)?.name;
}

export function vendorLabel(vendor: ModelVendorId): string {
  const labels: Record<ModelVendorId, string> = {
    openai: 'OpenAI',
    google: 'Google',
    bytedance: 'Bytedance',
    alibaba: 'Alibaba',
    midjourney: 'Midjourney',
    bfl: 'Black Forest Labs',
    kuaishou: 'Kuaishou',
    xai: 'xAI',
    minimax: 'MiniMax',
    anthropic: 'Anthropic',
    deepseek: 'DeepSeek',
    moonshot: 'Moonshot',
    vidu: 'Shengshu',
  };
  return labels[vendor];
}
