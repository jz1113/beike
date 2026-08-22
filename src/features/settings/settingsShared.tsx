'use client';

import React from 'react';
import { Database } from 'lucide-react';
import { ComflyLogo, OneBoundLogo, ApiaLogo } from '@/shared/ui/BrandIcons';

export interface WorkflowModel {
  id: string;
  name: string;
  shortName: string;
  badge?: string;
  desc?: string;
  isMultimodal?: boolean; // 🧠 多模态大模型 (涵盖视觉分析、架构推理、分镜策划、AI对话)
  isImage: boolean;       // 🎨 商业生图 (4K电商图/分镜生图)
  isVideo: boolean;       // 🎬 视频生成 (短视频/动态运镜)
  isVision?: boolean;     // 兼容字段
  isAssistant?: boolean;  // 兼容字段
  isDistill?: boolean;    // 兼容字段
  isThinking?: boolean;   // 兼容字段
  isCustom?: boolean;
}

// 🌟 系统预设精选核心模型
export const DEFAULT_PRESET_MODELS: WorkflowModel[] = [
  // --- 1. 旗舰多模态大模型 (视觉分析/分镜策划/架构推理/AI对话) ---
  { 
    id: 'claude-opus-5', 
    name: 'Claude Opus 5 (推荐 · 顶级深度推理)', 
    shortName: 'Claude Opus 5', 
    isMultimodal: true,
    isVision: true, 
    isImage: false, 
    isVideo: false,
    isAssistant: true, 
    isDistill: true,
    isThinking: true,
    badge: '旗舰推理',
    desc: 'Anthropic 顶尖深度推理大模型，Skill 提炼与高阶 Prompt 架构首选',
    isCustom: false 
  },
  { 
    id: 'claude-fable-5', 
    name: 'Claude Fable 5 (高智商结构化)', 
    shortName: 'Claude Fable 5', 
    isMultimodal: true,
    isVision: true, 
    isImage: false, 
    isVideo: false,
    isAssistant: true, 
    isDistill: true,
    isThinking: true,
    badge: '架构专家',
    desc: '擅长高密度复杂规则提取与严格格式化 System Prompt 编写',
    isCustom: false 
  },
  { 
    id: 'gemini-3.1-pro-preview-thinking-high', 
    name: 'Gemini 3.1 Pro (深度思考)', 
    shortName: 'Gemini 3.1 Pro', 
    isMultimodal: true,
    isVision: true, 
    isImage: false, 
    isVideo: false,
    isAssistant: true, 
    isDistill: true,
    isThinking: true,
    badge: '多模态首选',
    desc: 'Google 旗舰视觉与多模态深度理解模型，中文生活化场景推断最强',
    isCustom: false 
  },
  { 
    id: 'grok-4.6', 
    name: 'Grok 4.6 (反AI纪实)', 
    shortName: 'Grok 4.6', 
    isMultimodal: true,
    isVision: true, 
    isImage: false, 
    isVideo: false,
    isAssistant: true, 
    isDistill: false,
    isThinking: false,
    badge: '反AI纪实',
    desc: 'xAI 自然语言表达与生活感反 AI 实拍提示词生成',
    isCustom: false 
  },
  { 
    id: 'gpt-5.5-pro', 
    name: 'GPT 5.5 Pro', 
    shortName: 'GPT 5.5 Pro', 
    isMultimodal: true,
    isVision: true, 
    isImage: false, 
    isVideo: false,
    isAssistant: true, 
    isDistill: true,
    isThinking: true,
    badge: '综合旗舰',
    desc: 'OpenAI 顶级综合理解与全模态分析模型',
    isCustom: false 
  },
  { 
    id: 'gemini-3.7-flash', 
    name: 'Gemini 3.7 Flash', 
    shortName: 'Gemini 3.7 Flash', 
    isMultimodal: true,
    isVision: true, 
    isImage: false, 
    isVideo: false,
    isAssistant: true, 
    isDistill: false,
    isThinking: true,
    badge: '极速推理',
    desc: 'Google 极速响应多模态推理模型',
    isCustom: false 
  },
  { 
    id: 'claude-3-7-sonnet', 
    name: 'Claude 3.7 Sonnet', 
    shortName: 'Claude 3.7', 
    isMultimodal: true,
    isVision: true, 
    isImage: false, 
    isVideo: false,
    isAssistant: true, 
    isDistill: true,
    isThinking: true,
    badge: '极速推理',
    desc: '极速响应与高质量电商视觉分析',
    isCustom: false 
  },

  // --- 2. 商业生图模型 (Step 3 绘图) ---
  { 
    id: 'gpt-image-2', 
    name: 'GPT Image 2 (标准)', 
    shortName: 'GPT Image 2', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '4K标准',
    desc: 'OpenAI 官方文档标准通道，支持 low/medium/high 画质与参考图编辑',
    isCustom: false 
  },
  { 
    id: 'gpt-image-2-4k', 
    name: 'GPT Image 2 4K (专线)', 
    shortName: 'GPT Image 2 4K', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '4K专线',
    desc: 'OpenAI 4K 高分辨率专线加速通道',
    isCustom: false 
  },
  { 
    id: 'gpt-image-2-2k', 
    name: 'GPT Image 2 2K', 
    shortName: 'GPT Image 2 2K', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '2K',
    desc: 'comfly 网关 2K 档位 model id',
    isCustom: false 
  },
  { 
    id: 'grok-imagine-image-2.0', 
    name: 'Grok 4.1 Image', 
    shortName: 'Grok Image', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '反AI实拍',
    desc: 'xAI 拟真手机镜头生活化生图大模型',
    isCustom: false 
  },
  { 
    id: 'grok-4.2-image', 
    name: 'Grok 4.2 Image', 
    shortName: 'Grok 4.2', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '最新',
    desc: 'xAI Grok 4.2 文生图',
    isCustom: false 
  },
  { 
    id: 'doubao-seedream-5-0-260128', 
    name: 'Seedream 5.0 官方版', 
    shortName: 'Seedream 5.0', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '电商爆款',
    desc: '字节跳动专为电商场景训练的超高清生图大模型',
    isCustom: false 
  },
  { 
    id: 'seedream-3.0', 
    name: 'Seedream 3.0 (字节跳动)', 
    shortName: 'Seedream 3.0', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '极速生成',
    desc: '低延迟电商主图与买家秀生成',
    isCustom: false 
  },
  { 
    id: 'flux-pro', 
    name: 'Flux Pro (商业级光影)', 
    shortName: 'Flux Pro', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '极致光影',
    desc: 'Black Forest Labs 顶级商业质感生图模型',
    isCustom: false 
  },
  { 
    id: 'midjourney-v6', 
    name: 'Midjourney v6.1', 
    shortName: 'Midjourney', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '艺术质感',
    desc: '艺术设计与高级摄影风格生图',
    isCustom: false 
  },

  // --- 3. 旗舰视频大模型 (首页与视频生成) ---
  { 
    id: 'doubao-seedance-2.5', 
    name: '即梦 Seedance 2.5 (50图超强参考)', 
    shortName: 'Seedance 2.5', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '最强视频',
    desc: '即梦最新 2.5 旗舰视频大模型，支持全能参考与高表现力运动控制',
    isCustom: false 
  },
  { 
    id: 'doubao-seedance-2.0-mini', 
    name: '即梦 Seedance 2.0 mini (字节跳动)', 
    shortName: 'Seedance 2.0 mini', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '极致性价比',
    desc: '字节跳动即梦 2.0 mini 旗舰视频生成，极致性价比与超快运镜',
    isCustom: false 
  },
  { 
    id: 'doubao-seedance-2-0-fast-260128', 
    name: '即梦 Seedance 2.0 Fast VIP (极速出片)', 
    shortName: 'Seedance 2.0 Fast', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: 'VIP极速',
    desc: '即梦 2.0 Fast VIP 专线，极速响应与超高画质',
    isCustom: false 
  },
  { 
    id: 'doubao-seedance-2-0-260128', 
    name: '即梦 Seedance 2.0 VIP (全模态能力)', 
    shortName: 'Seedance 2.0 VIP', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '全模态',
    desc: '即梦 2.0 VIP 全模态通道，音视文图均可参考，高连贯运镜',
    isCustom: false 
  },
  { 
    id: 'doubao-seedance-1-5-pro-251215', 
    name: '即梦 Seedance 1.5 Pro (音画同出)', 
    shortName: 'Seedance 1.5 Pro', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '音画同出',
    desc: '原生生成音效与背景环境音，全新沉浸式生成体验',
    isCustom: false 
  },
  { 
    id: 'veo3', 
    name: 'Google Veo 3 (DeepMind 电影级)', 
    shortName: 'Google Veo 3', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '电影画质',
    desc: 'Google DeepMind 顶级电影级运镜与真实物理仿真视频大模型',
    isCustom: false 
  },
  { 
    id: 'sora-2', 
    name: 'OpenAI Sora 2 (世界模型)', 
    shortName: 'Sora 2', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '世界模型',
    desc: 'OpenAI 顶级视频生成与物理世界拟真大模型',
    isCustom: false 
  },
  { 
    id: 'kling-v2-pro', 
    name: '快手可灵 Kling 2.0 Pro (精准运镜)', 
    shortName: '快手可灵 2.0 Pro', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '精准运镜',
    desc: '快手可灵 2.0 Pro 旗舰模型，大幅度肢体动作与复杂物理规律模拟',
    isCustom: false 
  },
  { 
    id: 'kling-v1-6', 
    name: '快手可灵 Kling 1.6 (高连贯性)', 
    shortName: '快手可灵 1.6', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '高连贯性',
    desc: '快手可灵 1.6 高画质版本，擅长复杂场景时空连贯生成',
    isCustom: false 
  },
  { 
    id: 'runway-gen3-alpha-turbo', 
    name: 'Runway Gen-3 Alpha Turbo (好莱坞级)', 
    shortName: 'Runway Gen-3', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '好莱坞级',
    desc: 'Runway 旗舰视频生成，超强镜头运镜与影视级光影表达',
    isCustom: false 
  },
  { 
    id: 'luma-dream-machine-v2', 
    name: 'Luma Dream Machine 2.0 (写实物理)', 
    shortName: 'Luma 2.0', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '写实物理',
    desc: 'Luma 电影级光影与真实物理世界交互模拟',
    isCustom: false 
  },
  { 
    id: 'MiniMax-H3', 
    name: 'MiniMax-H3 (海螺 3.0 旗舰)', 
    shortName: 'MiniMax-H3', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '旗舰高动态',
    desc: 'MiniMax 官方最新 H3 视频大模型，电影级运镜与丰富物理细节仿真',
    isCustom: false 
  },
  { 
    id: 'minimax-video-01', 
    name: 'MiniMax 海螺 Video-01 (生动人像)', 
    shortName: '海螺 Video-01', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '生动人像',
    desc: 'MiniMax 影视级动作镜头与丰富人物微表情视频生成',
    isCustom: false 
  },
  { 
    id: 'wan2.6-t2v', 
    name: '阿里通义万相 2.6 (东方美学)', 
    shortName: '通义万相 2.6', 
    isVision: false, 
    isImage: false, 
    isVideo: true,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '东方美学',
    desc: '阿里通义万相 2.6 旗舰视频大模型，高质感光影与东方美学构图',
    isCustom: false 
  }
];

// 🌟 系统实际调用的真实核心业务接口定义
export interface ApiServiceItem {
  id: string;
  name: string;
  subTitle: string;
  category: 'core' | 'ecommerce' | 'social' | 'storage';
  renderLogo: (cls?: string) => React.ReactNode;
  isEnabled: boolean;
  tag: string;
  docsUrl?: string;
  registerUrl?: string;
  registerName?: string;
  defaultBaseUrl?: string;
  description?: string;
  capabilities?: string[];
}

export const API_SERVICES: ApiServiceItem[] = [
  // ===================== 核心系统网关与全网数据采集 =====================
  {
    id: 'comfly_gateway',
    name: 'Comfly AI 智能大模型网关',
    subTitle: 'OpenAI Compatible · 854+ 模型聚合',
    category: 'core',
    renderLogo: (cls = "w-5 h-5") => <ComflyLogo className={cls} />,
    isEnabled: true,
    tag: '大模型主网关',
    docsUrl: 'https://gpt-best.apifox.cn',
    registerUrl: 'https://ai.comfly.org',
    registerName: '前往 Comfly 官网注册并获取 Key',
    defaultBaseUrl: 'https://ai.comfly.org',
    description: '企业级大模型聚合网关，单 API Key 统一无缝调度 OpenAI、Claude、Gemini、字节即梦、FLUX、Midjourney 等 854+ 全球顶尖模型。',
    capabilities: ['854+ 聚合模型', '高并发负载均衡', '自动容灾切换', '官方原生流式响应']
  },
  {
    id: 'wanbang_ecommerce',
    name: 'ONEBOUND 万邦电商数据采集接口',
    subTitle: '淘宝/京东/拼多多/1688 全网主图解析',
    category: 'ecommerce',
    renderLogo: (cls = "w-5 h-5") => <OneBoundLogo className={cls} />,
    isEnabled: true,
    tag: '全网电商',
    docsUrl: 'https://open.onebound.cn',
    registerUrl: 'https://open.onebound.cn',
    registerName: '前往万邦开放平台注册并申请 Key',
    defaultBaseUrl: 'https://api-gw.onebound.cn',
    description: '专业级电商商品数据采集开放平台，支持天猫、淘宝、京东、1688、拼多多、抖音电商商品高清主图、SKU 规格及详情图集毫秒级解析。',
    capabilities: ['全网电商商品爬取', '高清无水印主图', 'SKU 与规格解析', '批量图集抓取']
  },
  {
    id: 'apia_parser',
    name: 'APIA 第三方短视频/图集解析接口',
    subTitle: 'https://apia.vip · 小红书/抖音/快手无水印提取',
    category: 'social',
    renderLogo: (cls = "w-5 h-5") => <ApiaLogo className={cls} />,
    isEnabled: true,
    tag: '社媒图集解析',
    docsUrl: 'https://apia.vip',
    registerUrl: 'https://apia.vip',
    registerName: '前往 APIA 官网注册获取凭证',
    defaultBaseUrl: 'https://apia.vip',
    description: '第三方社媒内容逆向解析引擎，支持小红书爆款图集、抖音高清视频与快手无水印原图毫秒级直链提取。',
    capabilities: ['小红书笔记图集', '抖音高清短视频', '快手作品解析', '无水印原图提取']
  },
  {
    id: 'cloud_storage',
    name: '云端永久对象存储 (Cloudflare R2 / OSS / COS / S3)',
    subTitle: '永久存储 · 0 本地硬盘占用 · 解决第三方临时链接过期',
    category: 'storage',
    renderLogo: (cls = "w-5 h-5") => <Database className={cls} />,
    isEnabled: true,
    tag: '媒体永久存储',
    docsUrl: 'https://developers.cloudflare.com/r2/',
    registerUrl: 'https://dash.cloudflare.com/sign-up',
    registerName: '前往 Cloudflare 官网注册并开通 R2',
    defaultBaseUrl: 'https://pub-xxx.r2.dev',
    description: '通过标准 S3 / R2 对象存储协议，将生图与生视频任务返回的短期临时链接自动、流式转存为您专属的永久 CDN 访问链接，彻底解决链接失效并实现本地磁盘 0 占用。',
    capabilities: ['Cloudflare R2 兼容', '10GB/月 免费存储', '0 出网流量费', '自动异步静默转存', '存量任务一键批量迁移']
  }
];
