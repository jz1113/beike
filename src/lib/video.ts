/**
 * AI 视频生成模型与参数适配引擎
 * 对齐 /v2/videos/generations 规范接口与各大旗舰视频大模型
 */

export interface VideoGenModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  isPrimary?: boolean;
  isNew?: boolean;
  isVip?: boolean;
  badge?: string;
  description: string;
  supportedDurations: number[]; // e.g. [4, 5, 8, 10]
  supportedResolutions: ('720P' | '1080P' | '4K')[];
  supportedAspectRatios: string[];
}

export const VIDEO_GEN_MODELS: VideoGenModel[] = [
  {
    id: 'doubao-seedance-2.5',
    name: '即梦 Seedance 2.5',
    shortName: '即梦 2.5',
    provider: 'Bytedance / Seed',
    isPrimary: true,
    isNew: true,
    badge: '最强模型',
    description: '最强模型，支持 50 个参考，新增视频编辑、超长生成与电影级物理世界质感',
    supportedDurations: [4, 5, 8, 10],
    supportedResolutions: ['720P', '1080P', '4K'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
  },
  {
    id: 'doubao-seedance-2.0-mini',
    name: '即梦 Seedance 2.0 mini',
    shortName: '即梦 2.0 mini',
    provider: 'Bytedance / Seed',
    isPrimary: true,
    isNew: true,
    badge: '极致性价比',
    description: '极致性价比，相近的高清体验，比 Fast 更快的推理速度与动态流体表现',
    supportedDurations: [4, 5, 8],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
  },
  {
    id: 'doubao-seedance-2-0-fast-260128',
    name: '即梦 Seedance 2.0 Fast VIP',
    shortName: '即梦 2.0 Fast',
    provider: 'Bytedance / Seed',
    isVip: true,
    isNew: true,
    badge: '极速推理',
    description: '极速推理，会员专属通道，音视文图均可参考，秒级响应出片',
    supportedDurations: [4, 5, 8],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
  },
  {
    id: 'doubao-seedance-2-0-260128',
    name: '即梦 Seedance 2.0 VIP',
    shortName: '即梦 2.0 VIP',
    provider: 'Bytedance / Seed',
    isVip: true,
    isNew: true,
    badge: '全模态能力',
    description: '全模态能力，会员专属通道，音视文图均可参考，高连贯运镜与复杂交互',
    supportedDurations: [5, 8, 10],
    supportedResolutions: ['720P', '1080P', '4K'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
  },
  {
    id: 'doubao-seedance-1-5-pro-251215',
    name: '即梦 Seedance 1.5 Pro',
    shortName: '即梦 1.5 Pro',
    provider: 'Bytedance / Seed',
    isNew: true,
    badge: '音画同出',
    description: '音画同出，原生生成音效与背景环境音，全新沉浸式生成体验',
    supportedDurations: [4, 5],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4']
  },
  {
    id: 'veo3',
    name: 'Google Veo 3',
    shortName: 'Veo 3',
    provider: 'Google DeepMind',
    isPrimary: true,
    badge: '电影级运镜',
    description: 'DeepMind 旗舰高动态电影画质，理解丰富电影视听语言与时间连续性',
    supportedDurations: [5, 8, 10],
    supportedResolutions: ['720P', '1080P', '4K'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
  },
  {
    id: 'sora-2',
    name: 'OpenAI Sora 2',
    shortName: 'Sora 2',
    provider: 'OpenAI',
    badge: '物理世界模拟',
    description: 'OpenAI 影视级物理世界世界模型，保持超长镜头主体与环境的一致性',
    supportedDurations: [5, 10],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1']
  },
  {
    id: 'MiniMax-H3',
    name: 'MiniMax-H3 (海螺 3.0)',
    shortName: 'MiniMax-H3',
    provider: 'MiniMax',
    isPrimary: true,
    isNew: true,
    badge: '旗舰高动态',
    description: 'MiniMax 官方最新 H3 旗舰视频大模型，电影级运镜与丰富物理细节仿真',
    supportedDurations: [4, 5, 8, 10],
    supportedResolutions: ['720P', '1080P', '4K'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
  },
  {
    id: 'MiniMax-Hailuo-2.3',
    name: 'MiniMax 海螺 Hailuo 2.3',
    shortName: '海螺 2.3',
    provider: 'MiniMax',
    badge: '高表现力',
    description: 'MiniMax 旗舰视频生成模型，超强动作连贯性与电影级画面张力',
    supportedDurations: [5, 8],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4']
  },
  {
    id: 'T2V-01',
    name: '快手可灵 Kling (T2V-01)',
    shortName: '可灵 Kling',
    provider: 'Kuaishou',
    badge: '动作精准控制',
    description: '超强人体动力学控制与镜头运动，大幅度肢体动作不崩坏',
    supportedDurations: [5, 10],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
  },
  {
    id: 'wan2.6-t2v',
    name: '阿里通义万相 Wan 2.6',
    shortName: '万相 2.6',
    provider: 'Alibaba',
    badge: '东方美学',
    description: '阿里通义万相开源旗舰视频模型，超强中文国潮、电商与产品动态理解力',
    supportedDurations: [5, 8],
    supportedResolutions: ['720P', '1080P'],
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4']
  }
];

export interface VideoAspectRatioItem {
  id: string;
  label: string;
  ratio: string;
  iconType: string;
}

export const VIDEO_ASPECT_RATIOS: VideoAspectRatioItem[] = [
  { id: '21:9', label: '21:9', ratio: '21:9', iconType: 'ultrawide' },
  { id: '16:9', label: '16:9', ratio: '16:9', iconType: 'wide169' },
  { id: '4:3', label: '4:3', ratio: '4:3', iconType: 'wide43' },
  { id: '1:1', label: '1:1', ratio: '1:1', iconType: 'square' },
  { id: '3:4', label: '3:4', ratio: '3:4', iconType: 'tall34' },
  { id: '9:16', label: '9:16', ratio: '9:16', iconType: 'tall916' }
];

export interface VideoRefModeItem {
  id: string;
  name: string;
  desc: string;
  tag?: string;
  badge?: string;
}

export const VIDEO_REF_MODES: VideoRefModeItem[] = [
  {
    id: 'omni',
    name: '全能参考',
    desc: '自动识别参考图内容，融合主体人物、商品、场景或动作进行智能演绎',
    tag: '默认推荐'
  },
  {
    id: 'first_last_frame',
    name: '首尾帧',
    desc: '指定第1帧起始图与最终帧结束图，精准控制过渡镜头的起承转合',
    tag: '起承转合'
  },
  {
    id: 'multi_frame',
    name: '智能多帧',
    desc: '上传 2-6 张关键帧序列，大模型沿时间线自然补齐中间动态过程',
    tag: '多镜头'
  }
];

export const VIDEO_RESOLUTIONS: ('480P' | '720P' | '1080P' | '4K')[] = ['480P', '720P', '1080P', '4K'];
export const VIDEO_DURATIONS: number[] = [4, 5, 8, 10, 15, 30];
