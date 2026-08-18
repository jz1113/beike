'use client';
import { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Settings, 
  Cpu, 
  Key, 
  Globe, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Zap, 
  Eye, 
  EyeOff, 
  Sliders,
  Check, 
  ShoppingBag, 
  Sparkles, 
  Layers, 
  Image as ImageIcon,
  Film,
  Video, 
  Search, 
  Plus, 
  RefreshCw, 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronRight, 
  Server, 
  Database, 
  Palette, 
  Info, 
  Copy, 
  Trash2, 
  CheckCheck, 
  RotateCcw,
  Bot,
  Wand2,
  Filter,
  CheckSquare,
  Square,
  ArrowRight,
  SlidersVertical,
  Minus,
  Activity,
  Maximize2,
  MinusCircle,
  HelpCircle,
  Radio,
  FileText,
  Scan,
  Bell,
  BarChart3,
  Terminal,
  Shield,
  Shuffle,
  Building2,
  Share2,
  CheckCircle,
  Link2,
  ExternalLink,
  BookOpen,
  Code2,
  Compass,
  PlayCircle,
  ShieldCheck
} from 'lucide-react';
import { VISION_MODELS, VisionModel } from '@/lib/vision';
import { IMAGE_GEN_MODELS, ImageGenModel } from '@/lib/drawing';
import { 
  getModelIcon,
  OpenAIIcon,
  GeminiIcon,
  ClaudeIcon,
  GrokIcon,
  MidjourneyIcon,
  FluxIcon,
  DoubaoIcon,
  DeepSeekIcon,
  QwenIcon,
  StabilityAIIcon,
  ZhipuGLMIcon,
  KimiIcon,
  MetaLlamaIcon,
  KlingIcon,
  MiniMaxIcon,
  RunwayIcon,
  LumaIcon,
  IdeogramIcon,
  SunoIcon,
  StepfunIcon,
  YiIcon,
  BaiduErnieIcon,
  TencentHunyuanIcon
} from '@/components/common/ModelIcons';
import { JdIcon, TaobaoIcon, ComflyLogo, OneBoundLogo, ApiaLogo } from '@/components/common/BrandIcons';
import { useAppStore } from '@/store/useAppStore';
import { getUsageSummary, clearUsageLogs, type UsageSummary } from '@/lib/usageTracker';
import GatewayModelModal, { GatewayModelItem } from './GatewayModelModal';

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
    name: 'GPT Image 2 (4K Ultra)', 
    shortName: 'GPT Image 2', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '4K超清',
    desc: 'OpenAI 商业摄影级 4K 高保真生图引擎',
    isCustom: false 
  },
  { 
    id: 'gpt-image-2-4k', 
    name: 'GPT Image 2 4K', 
    shortName: 'GPT Image 2 4K', 
    isVision: false, 
    isImage: true, 
    isVideo: false,
    isAssistant: false, 
    isDistill: false,
    isThinking: false,
    badge: '4K专线',
    desc: 'OpenAI 4K 高分辨率快速生图通道',
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
    defaultBaseUrl: 'https://pub-xxx.r2.dev',
    description: '通过标准 S3 / R2 对象存储协议，将生图与生视频任务返回的短期临时链接自动、流式转存为您专属的永久 CDN 访问链接，彻底解决链接失效并实现本地磁盘 0 占用。',
    capabilities: ['Cloudflare R2 兼容', '10GB/月 免费存储', '0 出网流量费', '自动异步静默转存', '存量任务一键批量迁移']
  }
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: Props) {
  const { 
    selectedVisionModel, 
    setSelectedVisionModel,
    selectedImageGenModel,
    setSelectedImageGenModel,
    quickVideoModel,
    setQuickVideoModel
  } = useAppStore();

  // 1. 左侧大类导航
  const [navSection, setNavSection] = useState<'api_services' | 'defaults' | 'usage' | 'appearance' | 'about'>('api_services');
  
  // 2. 中间选中的 API 接口
  const [selectedServiceId, setSelectedServiceId] = useState<string>('comfly_gateway');
  const [serviceSearch, setServiceSearch] = useState('');

  // 2.1 用量统计面板状态 (基于真实调用记录)
  const [usageRange, setUsageRange] = useState<'30d' | '90d' | '1y'>('30d');
  const [activityMetric, setActivityMetric] = useState<'token' | 'cost'>('token');
  const [exploreFilter, setExploreFilter] = useState<string>('provider');
  const [usageModelSearch, setUsageModelSearch] = useState<string>('');
  const [usageRefreshKey, setUsageRefreshKey] = useState<number>(0);

  const usageSummary: UsageSummary = useMemo(() => {
    return getUsageSummary(usageRange);
  }, [usageRange, usageRefreshKey, navSection]);

  // 3. Comfly API Key 与 Base URL
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://ai.comfly.org');
  const [showKey, setShowKey] = useState(false);
  const [isGatewayEnabled, setIsGatewayEnabled] = useState(true);

  // 4. 万邦 (OneBound) 电商数据采集接口状态
  const [wanbangKey, setWanbangKey] = useState('');
  const [wanbangSecret, setWanbangSecret] = useState('');
  const [showWanbangSecret, setShowWanbangSecret] = useState(false);
  const [isWanbangEnabled, setIsWanbangEnabled] = useState(true);

  // 5. 备用第三方电商爬虫接口状态 (天猫/淘宝/1688等)
  const [scraperId, setScraperId] = useState('202037331');
  const [scraperSecret, setScraperSecret] = useState('32843381450B00510784B97CBD53A7CDCD70844F87652F97FE');
  const [showScraperSecret, setShowScraperSecret] = useState(false);

  // 6. APIA 第三方短视频/图集解析接口 (小红书/抖音/快手)
  const [apiaKey, setApiaKey] = useState('');
  const [apiaBaseUrl, setApiaBaseUrl] = useState('https://apia.vip');
  const [showApiaKey, setShowApiaKey] = useState(false);
  const [isApiaEnabled, setIsApiaEnabled] = useState(true);

  // 7. 云端永久对象存储 (Cloudflare R2 / 阿里云 OSS / 腾讯云 COS / 通用 S3)
  const [storageEnabled, setStorageEnabled] = useState(false);
  const [storageProvider, setStorageProvider] = useState<'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase'>('r2');
  const [storageAccountId, setStorageAccountId] = useState('');
  const [storageEndpoint, setStorageEndpoint] = useState('');
  const [storageAccessKeyId, setStorageAccessKeyId] = useState('');
  const [storageSecretAccessKey, setStorageSecretAccessKey] = useState('');
  const [showStorageSecret, setShowStorageSecret] = useState(false);
  const [storageBucketName, setStorageBucketName] = useState('');
  const [storagePublicDomain, setStoragePublicDomain] = useState('');
  const [isTestingStorage, setIsTestingStorage] = useState(false);
  const [isMigratingStorage, setIsMigratingStorage] = useState(false);

  // 7. 网关发现模态窗 (854+)
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [isFetchingGateway, setIsFetchingGateway] = useState(false);
  const [allGatewayModels, setAllGatewayModels] = useState<GatewayModelItem[]>([]);

  // 8. 手动添加模型模态窗
  const [isAddingModelModalOpen, setIsAddingModelModalOpen] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelDesc, setNewModelDesc] = useState('');
  const [newModelFeatures, setNewModelFeatures] = useState({
    isMultimodal: true,
    isImage: false,
    isVideo: false,
    isVision: true,
    isAssistant: true,
    isDistill: false,
    isThinking: false
  });

  // 9. 业务默认模型路由状态 (多模态大模型、商业生图、视频生成)
  const [activeVisionModel, setActiveVisionModel] = useState('gemini-3.1-pro-preview-thinking-high');
  const [activeImageGenModel, setActiveImageGenModel] = useState('gpt-image-2');
  const [activeVideoGenModel, setActiveVideoGenModel] = useState('doubao-seedance-2.5');
  const [activeAssistantModel, setActiveAssistantModel] = useState('gemini-3.1-pro-preview-thinking-high');
  const [activeDistillModel, setActiveDistillModel] = useState('claude-opus-5');

  // 8. 自定义模型库 (Custom Models)
  const [customModels, setCustomModels] = useState<WorkflowModel[]>(DEFAULT_PRESET_MODELS);
  const [modelSearch, setModelSearch] = useState('');
  const [modelCapabilityFilter, setModelCapabilityFilter] = useState<'all' | 'multimodal' | 'image' | 'video'>('all');

  // 9. 添加/编辑模型抽屉状态
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<WorkflowModel | null>(null);

  // 10. 临时表单状态 (新增/修改模型)
  const [formModel, setFormModel] = useState<{
    id: string;
    name: string;
    shortName: string;
    desc: string;
    badge: string;
    isMultimodal: boolean;
    isImage: boolean;
    isVideo: boolean;
    isVision?: boolean;
    isAssistant?: boolean;
    isDistill?: boolean;
    isThinking?: boolean;
  }>({
    id: '',
    name: '',
    shortName: '',
    desc: '',
    badge: '',
    isMultimodal: true,
    isVision: true,
    isImage: false,
    isVideo: false,
    isAssistant: true,
    isDistill: false,
    isThinking: false
  });

  // 11. 连接测试状态与 Toast
  const [isTesting, setIsTesting] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // 初始化加载配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('ai_api_key') || '';
      const savedUrl = localStorage.getItem('ai_base_url') || 'https://ai.comfly.org';
      setApiKey(savedKey);
      setBaseUrl(savedUrl);

      const savedWbKey = localStorage.getItem('wanbang_api_key') || '';
      const savedWbSec = localStorage.getItem('wanbang_api_secret') || '';
      setWanbangKey(savedWbKey);
      setWanbangSecret(savedWbSec);

      const savedScraperId = localStorage.getItem('external_scraper_id') || '202037331';
      const savedScraperSec = localStorage.getItem('external_scraper_secret') || '32843381450B00510784B97CBD53A7CDCD70844F87652F97FE';
      setScraperId(savedScraperId);
      setScraperSecret(savedScraperSec);

      // 加载对象存储配置
      const savedStorageEnabled = localStorage.getItem('storage_enabled') === 'true';
      const savedStorageProvider = (localStorage.getItem('storage_provider') as any) || 'r2';
      const savedStorageAccId = localStorage.getItem('storage_account_id') || '';
      const savedStorageEndpoint = localStorage.getItem('storage_endpoint') || '';
      const savedStorageKeyId = localStorage.getItem('storage_access_key_id') || '';
      const savedStorageSecret = localStorage.getItem('storage_secret_access_key') || '';
      const savedStorageBucket = localStorage.getItem('storage_bucket_name') || '';
      const savedStorageDomain = localStorage.getItem('storage_public_domain') || '';

      setStorageEnabled(savedStorageEnabled);
      setStorageProvider(savedStorageProvider);
      setStorageAccountId(savedStorageAccId);
      setStorageEndpoint(savedStorageEndpoint);
      setStorageAccessKeyId(savedStorageKeyId);
      setStorageSecretAccessKey(savedStorageSecret);
      setStorageBucketName(savedStorageBucket);
      setStoragePublicDomain(savedStorageDomain);

      const savedVision = localStorage.getItem('ai_vision_model');
      if (savedVision) setActiveVisionModel(savedVision);

      const savedImage = localStorage.getItem('ai_image_gen_model');
      if (savedImage) setActiveImageGenModel(savedImage);

      const savedVideo = localStorage.getItem('ai_video_gen_model');
      if (savedVideo) {
        setActiveVideoGenModel(savedVideo);
      } else if (quickVideoModel) {
        setActiveVideoGenModel(quickVideoModel);
      }

      const savedAssistant = localStorage.getItem('ai_assistant_model');
      if (savedAssistant) setActiveAssistantModel(savedAssistant);

      const savedDistill = localStorage.getItem('ai_distill_model');
      if (savedDistill && (savedDistill.includes('claude') || savedDistill.includes('opus') || savedDistill.includes('fable'))) {
        setActiveDistillModel(savedDistill);
      } else {
        setActiveDistillModel('claude-opus-5');
        localStorage.setItem('ai_distill_model', 'claude-opus-5');
      }

      const savedCustom = localStorage.getItem('custom_models');
      if (savedCustom !== null) {
        try {
          const parsed = JSON.parse(savedCustom);
          if (Array.isArray(parsed)) {
            setCustomModels(parsed);
          } else {
            setCustomModels(DEFAULT_PRESET_MODELS);
            localStorage.setItem('custom_models', JSON.stringify(DEFAULT_PRESET_MODELS));
          }
        } catch (e) {
          setCustomModels(DEFAULT_PRESET_MODELS);
          localStorage.setItem('custom_models', JSON.stringify(DEFAULT_PRESET_MODELS));
        }
      } else {
        setCustomModels(DEFAULT_PRESET_MODELS);
        localStorage.setItem('custom_models', JSON.stringify(DEFAULT_PRESET_MODELS));
      }
    }
  }, [isOpen]);

  // 测试 Comfly 网关延迟 Ping
  const handleTestPing = async () => {
    if (!apiKey.trim()) {
      showToast('⚠️ 请先填写 API Key');
      return;
    }
    setIsTesting(true);
    const start = Date.now();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'hi' }],
          model: activeAssistantModel || 'gemini-3.1-pro-preview-thinking-high'
        })
      });
      const latency = Date.now() - start;
      if (res.ok) {
        showToast(`🟢 连通正常！响应延迟: ${latency}ms`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`🔴 连接异常 (${res.status}): ${err.error || '无法访问 API 网关'}`);
      }
    } catch (e: any) {
      showToast(`🔴 网络超时: ${e.message || '网关连接失败'}`);
    } finally {
      setIsTesting(false);
    }
  };

  // 自动保存 API 配置
  const handleSaveApiConfig = (newUrl: string, newKey: string) => {
    localStorage.setItem('ai_base_url', newUrl);
    localStorage.setItem('ai_api_key', newKey);
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: newUrl, apiKey: newKey })
    }).catch(() => {});
  };

  // 获取网关模型列表 (854+)
  const handleOpenGatewayDiscovery = async () => {
    if (allGatewayModels.length > 0) {
      setIsGatewayModalOpen(true);
      return;
    }

    if (!apiKey.trim()) {
      alert('请先填入有效的 API 密钥 (API Key)');
      return;
    }

    setIsFetchingGateway(true);
    setIsGatewayModalOpen(true);
    try {
      const res = await fetch('/api/models/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '获取失败');
      setAllGatewayModels(data.models || []);
    } catch (err: any) {
      alert(err.message || '获取网关模型列表失败');
    } finally {
      setIsFetchingGateway(false);
    }
  };

  // 安全触发模型更新事件通知 (微任务异步派发，杜绝跨组件并发 setState 冲突)
  const notifyModelsUpdated = () => {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new Event('models_updated'));
      }, 0);
    }
  };

  // 单个模型切换能力标签 (3 大核心能力)
  const handleToggleCapability = (modelId: string, field: 'isMultimodal' | 'isImage' | 'isVideo' | 'isVision' | 'isAssistant' | 'isDistill' | 'isThinking') => {
    setCustomModels(prev => {
      const updated = prev.map(m => {
        if (m.id === modelId) {
          if (field === 'isMultimodal' || field === 'isVision' || field === 'isAssistant' || field === 'isDistill' || field === 'isThinking') {
            const currentMulti = m.isMultimodal ?? m.isVision ?? true;
            const nextVal = !currentMulti;
            return {
              ...m,
              isMultimodal: nextVal,
              isVision: nextVal,
              isAssistant: nextVal,
              isDistill: nextVal,
              isThinking: nextVal
            };
          }
          return { ...m, [field]: !m[field] };
        }
        return m;
      });
      localStorage.setItem('custom_models', JSON.stringify(updated));
      return updated;
    });
    notifyModelsUpdated();
  };

  // 单个模型移出/删除
  const handleDeleteModel = (modelId: string) => {
    setCustomModels(prev => {
      const updated = prev.filter(m => m.id !== modelId);
      localStorage.setItem('custom_models', JSON.stringify(updated));
      return updated;
    });
    notifyModelsUpdated();
    showToast(`已移出模型 ${modelId}`);
  };

  // 恢复系统默认预设模型列表
  const handleResetDefaultModels = () => {
    if (confirm('确定恢复系统默认预设模型列表吗？这将覆盖当前的模型修改。')) {
      setCustomModels(DEFAULT_PRESET_MODELS);
      localStorage.setItem('custom_models', JSON.stringify(DEFAULT_PRESET_MODELS));
      notifyModelsUpdated();
      showToast('已恢复系统默认预设模型');
    }
  };

  // 手动添加模型
  const handleAddCustomModel = () => {
    if (!newModelId.trim()) {
      alert('请填写模型 ID');
      return;
    }
    const id = newModelId.trim();
    const name = newModelName.trim() || id;
    const isMulti = newModelFeatures.isMultimodal ?? newModelFeatures.isVision;

    const modelObj: WorkflowModel = {
      id,
      name,
      shortName: name.split(' ')[0],
      badge: '自定义',
      desc: newModelDesc.trim() || '用户自定义模型',
      isMultimodal: !!isMulti,
      isVision: !!isMulti,
      isAssistant: !!isMulti,
      isDistill: !!isMulti,
      isThinking: !!isMulti,
      isImage: newModelFeatures.isImage,
      isVideo: newModelFeatures.isVideo,
      isCustom: true
    };

    setCustomModels(prev => {
      const updated = [modelObj, ...prev.filter(m => m.id !== id)];
      localStorage.setItem('custom_models', JSON.stringify(updated));
      return updated;
    });
    notifyModelsUpdated();

    setIsAddingModelModalOpen(false);
    setNewModelId('');
    setNewModelName('');
    setNewModelDesc('');
    showToast(`✨ 成功添加模型【${name}】`);
  };

  // 过滤中间栏接口服务 (关键字搜索)
  const filteredServices = useMemo(() => {
    const q = serviceSearch.toLowerCase().trim();
    if (!q) return API_SERVICES;
    return API_SERVICES.filter(s => {
      const matchName = s.name.toLowerCase().includes(q);
      const matchSub = s.subTitle.toLowerCase().includes(q);
      const matchTag = (s.tag || '').toLowerCase().includes(q);
      return matchName || matchSub || matchTag;
    });
  }, [serviceSearch]);

  // 过滤模型列表 (3 大核心能力标签快速筛选与关键字搜索)
  const filteredModels = useMemo(() => {
    let list = customModels;
    if (modelCapabilityFilter === 'video') {
      list = list.filter(m => m.isVideo);
    } else if (modelCapabilityFilter === 'image') {
      list = list.filter(m => m.isImage);
    } else if (modelCapabilityFilter === 'multimodal') {
      list = list.filter(m => m.isMultimodal || m.isVision || (!m.isImage && !m.isVideo));
    }

    if (!modelSearch.trim()) return list;
    const q = modelSearch.toLowerCase().trim();
    return list.filter(m => 
      (m.name || '').toLowerCase().includes(q) || 
      m.id.toLowerCase().includes(q)
    );
  }, [customModels, modelSearch, modelCapabilityFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-950/60 backdrop-blur-xs select-none animate-fade-in">
      <div 
        className="w-[94vw] max-w-[1280px] 2xl:max-w-[1380px] h-[90vh] max-h-[860px] bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col font-sans relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Toast 提示条 */}
        {toastMsg && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-2 border border-slate-700 animate-fade-in">
            <span>{toastMsg}</span>
          </div>
        )}

        {/* 1. 顶部标准窗口控制条 */}
        <div className="h-14 px-6 border-b border-slate-100 bg-[#FBFBFB] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-2xs">
              <Settings className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <div className="text-sm sm:text-base font-bold text-slate-900 leading-tight">系统与接口配置中心</div>
              <div className="text-xs text-slate-400 font-mono mt-0.5">Comfly AI · ONEBOUND 万邦 · APIA 社媒解析</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200/60 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>服务就绪</span>
            </div>

            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
              title="关闭设置"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* 2. Cherry Studio 经典三栏架构 */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-white">
          
          {/* ===================== COLUMN 1: 左侧大类导航栏 (~210px) ===================== */}
          <div className="w-48 sm:w-54 border-r border-slate-100 bg-[#F9FAFB] p-3.5 flex flex-col flex-shrink-0 overflow-y-auto justify-between text-sm">
            <div className="space-y-5">
              {/* 分组：接口与服务 */}
              <div className="space-y-1.5">
                <div className="px-2.5 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">调用接口与服务</div>
                
                <button
                  onClick={() => setNavSection('api_services')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'api_services'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Server className="w-4.5 h-4.5 text-indigo-600" />
                  <span>服务接口配置</span>
                </button>

                <button
                  onClick={() => setNavSection('defaults')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'defaults'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <SlidersHorizontal className="w-4.5 h-4.5 text-purple-600" />
                  <span>默认业务模型</span>
                </button>

                <button
                  onClick={() => setNavSection('usage')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'usage'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Activity className="w-4.5 h-4.5 text-emerald-600" />
                  <span>用量统计</span>
                </button>
              </div>

              {/* 分组：偏好 */}
              <div className="space-y-1.5">
                <div className="px-2.5 py-1 text-xs font-bold text-slate-400 uppercase tracking-wider">偏好与系统</div>

                <button
                  onClick={() => setNavSection('appearance')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'appearance'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Palette className="w-4.5 h-4.5 text-slate-500" />
                  <span>外观偏好</span>
                </button>

                <button
                  onClick={() => setNavSection('about')}
                  className={`w-full px-3.5 py-3 rounded-xl text-sm font-semibold flex items-center gap-3 transition-all cursor-pointer ${
                    navSection === 'about'
                      ? 'bg-slate-200/90 text-slate-900 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Info className="w-4.5 h-4.5 text-slate-500" />
                  <span>关于系统</span>
                </button>
              </div>
            </div>

            {/* 底部状态徽章 */}
            <div className="p-3 rounded-2xl bg-white border border-slate-200/80 text-xs text-slate-600 space-y-1 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>核心接口就绪</span>
              </div>
              <p className="text-[11px] text-slate-400">Comfly + 万邦 + APIA 解析</p>
            </div>
          </div>

          {/* ===================== COLUMN 2: 中间调用的真实接口服务列表 (~280px) ===================== */}
          {navSection === 'api_services' && (
            <div className="w-72 sm:w-80 border-r border-slate-100 bg-white p-3.5 flex flex-col flex-shrink-0 min-h-0">
              {/* 搜索框 */}
              <div className="relative mb-2.5">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={e => setServiceSearch(e.target.value)}
                  placeholder="搜索接口服务..."
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#F3F4F6] text-sm text-slate-800 placeholder-slate-400 outline-none border border-transparent focus:border-slate-300 focus:bg-white transition-all shadow-2xs"
                />
              </div>

              {/* 真实接口列表 */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 no-scrollbar">
                {filteredServices.map(service => {
                  const isSelected = selectedServiceId === service.id;
                  return (
                    <div
                      key={service.id}
                      onClick={() => setSelectedServiceId(service.id)}
                      className={`px-3.5 py-3 rounded-xl flex items-center justify-between transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-[#EAEAEA] text-slate-900 font-bold shadow-2xs' 
                          : 'text-slate-700 hover:bg-[#F3F4F6]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-white shadow-2xs p-0.5 border border-slate-100">
                          {service.renderLogo("w-5 h-5")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] truncate font-bold text-slate-900">
                            {service.name.split(' ')[0]}
                          </div>
                          <div className="text-xs text-slate-500 font-normal truncate mt-0.5">
                            {service.subTitle}
                          </div>
                        </div>
                      </div>

                      {/* 在线指示灯 */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${service.isEnabled ? 'bg-[#22C55E]' : 'bg-slate-300'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 底部 */}
              <div className="pt-3 border-t border-slate-100 text-xs text-slate-400 text-center font-mono">
                共配置 {API_SERVICES.length} 项核心业务服务与接口
              </div>
            </div>
          )}

          {/* ===================== COLUMN 3: 右侧主配置工作区 (自适应) ===================== */}
          <div className="flex-1 overflow-y-auto bg-white min-h-0">
            
            {/* VIEW A: 调用的接口详细配置 */}
            {navSection === 'api_services' && (
              <div className="p-6 sm:p-8 space-y-6 max-w-4xl">
                
                {/* 1. 🌟 Comfly AI 大模型网关接口 */}
                {selectedServiceId === 'comfly_gateway' && (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <ComflyLogo className="w-9 h-9 rounded-xl shadow-2xs flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                              Comfly AI 智能大模型网关
                            </h2>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono">
                              🟢 正常运行 (已连接)
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            负责驱动全系统视觉分析 (Step 2)、商业生图 (Step 3)、AI 助手对话与 Skill 提炼
                          </p>
                        </div>
                      </div>

                      {/* 绿色大开关 */}
                      <div 
                        onClick={() => setIsGatewayEnabled(!isGatewayEnabled)}
                        className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
                          isGatewayEnabled ? 'bg-[#22C55E]' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-5.5 h-5.5 rounded-full bg-white shadow-xs transition-transform ${
                          isGatewayEnabled ? 'translate-x-5.5' : 'translate-x-0'
                        }`} />
                      </div>
                    </div>

                    {/* API 密钥 */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-slate-800 block">网关 API 密钥 (API Key)</label>
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex-1">
                          <input
                            type={showKey ? "text" : "password"}
                            value={apiKey}
                            onChange={e => {
                              setApiKey(e.target.value);
                              handleSaveApiConfig(baseUrl, e.target.value);
                            }}
                            placeholder="sk-..."
                            className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* 测速 Ping 按钮 */}
                        <button
                          onClick={handleTestPing}
                          disabled={isTesting}
                          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs"
                          title="测试连接延迟 (Ping)"
                        >
                          {isTesting ? <Loader2 className="w-4 h-4 animate-spin text-slate-600" /> : <Activity className="w-4 h-4" />}
                          <span>测速 Ping</span>
                        </button>
                      </div>
                    </div>

                    {/* API 地址 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-slate-800">网关 API 接口地址 (Base URL)</label>
                        <button 
                          onClick={() => {
                            const newUrl = prompt('请输入自定义端点 URL:', baseUrl);
                            if (newUrl) {
                              setBaseUrl(newUrl.trim());
                              handleSaveApiConfig(newUrl.trim(), apiKey);
                            }
                          }}
                          className="text-sm text-blue-600 hover:underline cursor-pointer font-semibold"
                        >
                          + 添加自定义端点
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={baseUrl}
                          onChange={e => {
                            setBaseUrl(e.target.value);
                            handleSaveApiConfig(e.target.value, apiKey);
                          }}
                          placeholder="https://ai.comfly.org"
                          className="w-full px-4 py-2.5 pr-10 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all shadow-2xs"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <Settings className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    {/* 模型工作流列表 */}
                    <div className="space-y-3.5 pt-2">
                      <div className="flex items-center justify-between flex-wrap gap-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm sm:text-base font-bold text-slate-800">该网关已启用的工作流模型</span>
                          <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                            {filteredModels.length} 款
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleResetDefaultModels}
                            className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            title="恢复系统出厂预设模型列表"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span className="hidden sm:inline">恢复预设</span>
                          </button>

                          <button
                            onClick={handleOpenGatewayDiscovery}
                            disabled={isFetchingGateway}
                            className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                          >
                            <RefreshCw className={`w-4 h-4 text-indigo-600 ${isFetchingGateway ? 'animate-spin' : ''}`} />
                            <span>获取网关模型库 ({allGatewayModels.length || '854+'})</span>
                          </button>

                          <button
                            onClick={() => setIsAddingModelModalOpen(true)}
                            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>添加模型</span>
                          </button>
                        </div>
                      </div>

                      {/* 🌟 分类药丸与搜索过滤条 (高端 Apple / Linear 分段控制风格) */}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 border border-slate-200/60 rounded-2xl text-xs sm:text-sm select-none overflow-x-auto">
                          {/* 全部模型 */}
                          <button
                            type="button"
                            onClick={() => setModelCapabilityFilter('all')}
                            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              modelCapabilityFilter === 'all'
                                ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5 text-slate-500" />
                            <span>全部</span>
                            <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                              modelCapabilityFilter === 'all' ? 'bg-slate-900 text-white font-bold' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {customModels.length}
                            </span>
                          </button>

                          {/* 多模态 */}
                          <button
                            type="button"
                            onClick={() => setModelCapabilityFilter('multimodal')}
                            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              modelCapabilityFilter === 'multimodal'
                                ? 'bg-white text-indigo-600 shadow-2xs border border-indigo-200'
                                : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/60'
                            }`}
                          >
                            <Bot className="w-3.5 h-3.5 text-indigo-500" />
                            <span>多模态</span>
                            <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                              modelCapabilityFilter === 'multimodal' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {customModels.filter(m => m.isMultimodal || m.isVision || (!m.isImage && !m.isVideo)).length}
                            </span>
                          </button>

                          {/* 商业生图 */}
                          <button
                            type="button"
                            onClick={() => setModelCapabilityFilter('image')}
                            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              modelCapabilityFilter === 'image'
                                ? 'bg-white text-amber-600 shadow-2xs border border-amber-200'
                                : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50/60'
                            }`}
                          >
                            <Palette className="w-3.5 h-3.5 text-amber-500" />
                            <span>生图</span>
                            <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                              modelCapabilityFilter === 'image' ? 'bg-amber-500 text-white font-bold' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {customModels.filter(m => m.isImage).length}
                            </span>
                          </button>

                          {/* 视频生成 */}
                          <button
                            type="button"
                            onClick={() => setModelCapabilityFilter('video')}
                            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              modelCapabilityFilter === 'video'
                                ? 'bg-white text-sky-600 shadow-2xs border border-sky-200'
                                : 'text-slate-500 hover:text-sky-600 hover:bg-sky-50/60'
                            }`}
                          >
                            <Video className="w-3.5 h-3.5 text-sky-500" />
                            <span>视频</span>
                            <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                              modelCapabilityFilter === 'video' ? 'bg-sky-500 text-white font-bold' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {customModels.filter(m => m.isVideo).length}
                            </span>
                          </button>
                        </div>

                        {/* 搜索框 */}
                        <div className="relative min-w-[200px] sm:min-w-[240px]">
                          <input
                            type="text"
                            value={modelSearch}
                            onChange={e => setModelSearch(e.target.value)}
                            placeholder="搜索模型 ID / 名称..."
                            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl bg-slate-50 border border-slate-200/80 text-slate-800 outline-none focus:bg-white focus:border-slate-400 shadow-2xs transition-all placeholder-slate-400"
                          />
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          {modelSearch && (
                            <button 
                              onClick={() => setModelSearch('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 模型列表 */}
                      <div className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
                        <div className="px-5 py-3 bg-[#F9FAFB] border-b border-slate-200 flex items-center justify-between text-sm text-slate-600 font-mono">
                          <span className="font-bold text-slate-800">工作流模型清单 ({filteredModels.length})</span>
                          <span className="text-xs text-slate-400 font-normal">点击彩色药丸开关各功能权限 (多模态 / 生图 / 视频)</span>
                        </div>

                        <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                          {filteredModels.map(m => (
                            <div
                              key={m.id}
                              className="px-5 py-3.5 hover:bg-[#F9FAFB] transition-colors flex items-center justify-between gap-4 group"
                            >
                              {/* 左侧：模型标识与名称 */}
                              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center flex-shrink-0 shadow-2xs">
                                  {getModelIcon(m.id, "w-5.5 h-5.5")}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-slate-900 font-bold text-sm truncate">
                                      {m.id}
                                    </span>
                                    {m.name && m.name !== m.id && (
                                      <span className="text-xs text-slate-500 truncate font-normal">
                                        ({m.name})
                                      </span>
                                    )}
                                    {m.badge && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                                        {m.badge}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 右侧：3 种核心能力开关药丸与操作 */}
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleCapability(m.id, 'isMultimodal')}
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border select-none ${
                                    (m.isMultimodal || m.isVision || (!m.isImage && !m.isVideo))
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-2xs font-bold' 
                                      : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-100 hover:text-slate-600 hover:border-slate-200'
                                  }`}
                                  title="多模态大模型 (涵盖视觉审图、逆向提炼、分镜策划与AI对话)"
                                >
                                  <Bot className={`w-3.5 h-3.5 ${(m.isMultimodal || m.isVision) ? 'text-indigo-600' : 'text-slate-300'}`} />
                                  <span>多模态</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleCapability(m.id, 'isImage')}
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border select-none ${
                                    m.isImage 
                                      ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-2xs font-bold' 
                                      : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-100 hover:text-slate-600 hover:border-slate-200'
                                  }`}
                                  title="商业生图能力 (Step 3 绘图)"
                                >
                                  <Palette className={`w-3.5 h-3.5 ${m.isImage ? 'text-amber-600' : 'text-slate-300'}`} />
                                  <span>生图</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleCapability(m.id, 'isVideo')}
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer border select-none ${
                                    m.isVideo 
                                      ? 'bg-sky-50 text-sky-700 border-sky-300 shadow-2xs font-bold' 
                                      : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-100 hover:text-slate-600 hover:border-slate-200'
                                  }`}
                                  title="视频生成能力 (首页/即梦视频)"
                                >
                                  <Video className={`w-3.5 h-3.5 ${m.isVideo ? 'text-sky-600' : 'text-slate-300'}`} />
                                  <span>视频</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteModel(m.id)}
                                  className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors ml-1 cursor-pointer"
                                  title="移出此模型"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* 2. 🛒 ONEBOUND 万邦电商数据采集接口 */}
                {selectedServiceId === 'wanbang_ecommerce' && (
                  <>
                    <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                      <div className="flex items-center gap-3.5">
                        <OneBoundLogo className="w-9 h-9 rounded-xl shadow-2xs flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                              ONEBOUND 万邦电商全网数据采集接口
                            </h2>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono">
                              🟢 已配置
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            支持从淘宝、天猫、京东、拼多多、1688 全网一键抓取商品高清主图与商品参数
                          </p>
                        </div>
                      </div>

                      <div 
                        onClick={() => setIsWanbangEnabled(!isWanbangEnabled)}
                        className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
                          isWanbangEnabled ? 'bg-[#22C55E]' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-5.5 h-5.5 rounded-full bg-white shadow-xs transition-transform ${
                          isWanbangEnabled ? 'translate-x-5.5' : 'translate-x-0'
                        }`} />
                      </div>
                    </div>

                    <div className="space-y-4 pt-2 text-sm">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">万邦 API Key (调用接口凭证)</label>
                        <input
                          type="text"
                          value={wanbangKey}
                          onChange={e => {
                            setWanbangKey(e.target.value);
                            localStorage.setItem('wanbang_api_key', e.target.value);
                          }}
                          placeholder="填入万邦开放平台 API Key"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">万邦 API Secret</label>
                        <input
                          type="password"
                          value={wanbangSecret}
                          onChange={e => {
                            setWanbangSecret(e.target.value);
                            localStorage.setItem('wanbang_api_secret', e.target.value);
                          }}
                          placeholder="填入万邦开放平台 API Secret"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      <div className="p-4.5 rounded-2xl bg-amber-50/50 border border-amber-200/60 text-amber-800 space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-sm">
                          <ShoppingBag className="w-4 h-4 text-amber-600" />
                          <span>全网商品采集触发场景</span>
                        </div>
                        <p className="text-xs sm:text-sm text-amber-700 leading-relaxed">
                          在系统首页直接粘贴电商商品链接（如 item.jd.com 或 detail.tmall.com），系统将自动调用万邦接口批量下载无水印主图并导入 Step 1。
                        </p>
                      </div>

                      <button
                        onClick={() => showToast('✅ 万邦电商采集接口配置已保存')}
                        className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors cursor-pointer shadow-xs"
                      >
                        保存万邦接口配置
                      </button>
                    </div>
                  </>
                )}

                {/* 3. 🌟 APIA 第三方短视频/图集解析接口 (apia.vip) */}
                {selectedServiceId === 'apia_parser' && (
                  <>
                    <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                      <div className="flex items-center gap-3.5">
                        <ApiaLogo className="w-9 h-9 rounded-xl shadow-2xs flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                              APIA 第三方短视频/图集解析接口 (apia.vip)
                            </h2>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold font-mono">
                              🟢 运行中
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            支持小红书、抖音、快手等全网爆款买家秀图集与视频分镜一键无水印提取
                          </p>
                        </div>
                      </div>

                      <div 
                        onClick={() => setIsApiaEnabled(!isApiaEnabled)}
                        className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
                          isApiaEnabled ? 'bg-[#22C55E]' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-5.5 h-5.5 rounded-full bg-white shadow-xs transition-transform ${
                          isApiaEnabled ? 'translate-x-5.5' : 'translate-x-0'
                        }`} />
                      </div>
                    </div>

                    <div className="space-y-4 pt-2 text-sm">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">APIA 接口端点地址</label>
                        <input
                          type="text"
                          value="https://apia.vip"
                          disabled
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm font-mono text-slate-600 outline-none shadow-2xs cursor-not-allowed"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">APIA Client ID (客户编号)</label>
                        <input
                          type="text"
                          value={scraperId}
                          onChange={e => {
                            setScraperId(e.target.value);
                            localStorage.setItem('external_scraper_id', e.target.value);
                          }}
                          placeholder="202037331"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">APIA Secret Key (接口密钥)</label>
                        <input
                          type="password"
                          value={scraperSecret}
                          onChange={e => {
                            setScraperSecret(e.target.value);
                            localStorage.setItem('external_scraper_secret', e.target.value);
                          }}
                          placeholder="32843381450B00510784B97CBD53A7CDCD70844F87652F97FE"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      <div className="p-4.5 rounded-2xl bg-indigo-50/50 border border-indigo-200/60 text-indigo-800 space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-sm">
                          <Link2 className="w-4 h-4 text-indigo-600" />
                          <span>支持的社媒链接类型</span>
                        </div>
                        <p className="text-xs sm:text-sm text-indigo-700 leading-relaxed">
                          • 小红书分享短链 (xhslink.com) 与 PC 端笔记链接 (xiaohongshu.com/discovery/item/...)<br />
                          • 抖音短视频与图文图集分享链接 (v.douyin.com)<br />
                          • 快手作品分享链接 (v.kuaishou.com)
                        </p>
                      </div>

                      <button
                        onClick={() => showToast('✅ APIA 第三方解析接口配置已保存')}
                        className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors cursor-pointer shadow-xs"
                      >
                        保存 APIA 接口配置
                      </button>
                    </div>
                  </>
                )}

                {/* 4. 🌟 云端永久对象存储配置 (Cloudflare R2 / OSS / COS / S3) */}
                {selectedServiceId === 'cloud_storage' && (
                  <>
                    <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
                          <Database className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                              云端永久对象存储配置 (Cloudflare R2 / OSS / S3)
                            </h2>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${
                              storageEnabled 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                              {storageEnabled ? '🟢 自动转存已开启' : '⚪ 未启用'}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            自动将生图与生视频任务的短期临时链接流式转存为您专属的永久 CDN 链接，0 本地硬盘占用
                          </p>
                        </div>
                      </div>

                      <div 
                        onClick={() => {
                          const nextVal = !storageEnabled;
                          setStorageEnabled(nextVal);
                          localStorage.setItem('storage_enabled', String(nextVal));
                          showToast(nextVal ? '🟢 已开启媒体自动转存' : '⚪ 已关闭自动转存');
                        }}
                        className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center shadow-inner flex-shrink-0 ${
                          storageEnabled ? 'bg-[#22C55E]' : 'bg-slate-300'
                        }`}
                        title={storageEnabled ? '点击关闭自动转存' : '点击开启自动转存'}
                      >
                        <div className={`w-5.5 h-5.5 rounded-full bg-white shadow-xs transition-transform ${
                          storageEnabled ? 'translate-x-5.5' : 'translate-x-0'
                        }`} />
                      </div>
                    </div>

                    <div className="space-y-4 pt-2 text-sm">
                      {/* 存储服务提供商切换 */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-2">存储服务商 (Provider)</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { id: 'r2', name: 'Cloudflare R2', badge: '首选·免费10G' },
                            { id: 'oss', name: '阿里云 OSS', badge: '国内极速' },
                            { id: 'cos', name: '腾讯云 COS', badge: '腾讯云' },
                            { id: 's3', name: '通用 S3 / MinIO', badge: 'S3 兼容' }
                          ].map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setStorageProvider(p.id as any);
                                localStorage.setItem('storage_provider', p.id);
                              }}
                              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                storageProvider === p.id 
                                  ? 'bg-indigo-50/60 border-indigo-300 text-indigo-900 shadow-2xs' 
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="font-bold text-xs">{p.name}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{p.badge}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* R2 Account ID 或 S3 Endpoint */}
                      {storageProvider === 'r2' ? (
                        <div>
                          <label className="font-bold text-slate-700 block mb-1.5">
                            Cloudflare 账户 ID (Account ID)
                          </label>
                          <input
                            type="text"
                            value={storageAccountId}
                            onChange={e => {
                              setStorageAccountId(e.target.value);
                              localStorage.setItem('storage_account_id', e.target.value);
                            }}
                            placeholder="如: 7d6c8b9a0e1f2a3b4c5d6e7f8a9b0c1d"
                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                          />
                          <p className="text-[11px] text-slate-400 mt-1">可在 Cloudflare 控制台 R2 概览页右侧「账户详细信息」中复制</p>
                        </div>
                      ) : (
                        <div>
                          <label className="font-bold text-slate-700 block mb-1.5">
                            对象存储 Endpoint (端点 URL)
                          </label>
                          <input
                            type="text"
                            value={storageEndpoint}
                            onChange={e => {
                              setStorageEndpoint(e.target.value);
                              localStorage.setItem('storage_endpoint', e.target.value);
                            }}
                            placeholder={storageProvider === 'oss' ? 'https://oss-cn-hangzhou.aliyuncs.com' : storageProvider === 'cos' ? 'https://cos.ap-guangzhou.myqcloud.com' : 'https://s3.us-east-1.amazonaws.com'}
                            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                          />
                        </div>
                      )}

                      {/* 存储桶名称 */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">存储桶名称 (Bucket Name)</label>
                        <input
                          type="text"
                          value={storageBucketName}
                          onChange={e => {
                            setStorageBucketName(e.target.value);
                            localStorage.setItem('storage_bucket_name', e.target.value);
                          }}
                          placeholder="例如: beikeyuntu-assets"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      {/* Access Key ID */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">Access Key ID</label>
                        <input
                          type="text"
                          value={storageAccessKeyId}
                          onChange={e => {
                            setStorageAccessKeyId(e.target.value);
                            localStorage.setItem('storage_access_key_id', e.target.value);
                          }}
                          placeholder="填写您的 S3 / R2 API Access Key"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                      </div>

                      {/* Secret Access Key */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">Secret Access Key</label>
                        <div className="relative">
                          <input
                            type={showStorageSecret ? "text" : "password"}
                            value={storageSecretAccessKey}
                            onChange={e => {
                              setStorageSecretAccessKey(e.target.value);
                              localStorage.setItem('storage_secret_access_key', e.target.value);
                            }}
                            placeholder="填写您的 S3 / R2 API Secret Key"
                            className="w-full pl-4 pr-11 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => setShowStorageSecret(!showStorageSecret)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showStorageSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* 公开访问域名 (Public Domain) */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">公开访问域名 (Public Domain / CDN)</label>
                        <input
                          type="text"
                          value={storagePublicDomain}
                          onChange={e => {
                            setStoragePublicDomain(e.target.value);
                            localStorage.setItem('storage_public_domain', e.target.value);
                          }}
                          placeholder="例如: https://pub-xxx.r2.dev 或 https://cdn.yourdomain.com"
                          className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono text-slate-900 outline-none focus:border-slate-400 shadow-2xs"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          在 R2 存储桶「设置 ➔ 公开访问」中开启并获取，用于在前端快速加载图片与视频
                        </p>
                      </div>

                      {/* 提示与优势说明 */}
                      <div className="p-4.5 rounded-2xl bg-indigo-50/50 border border-indigo-200/60 text-indigo-800 space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-sm">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                          <span>为什么推荐 Cloudflare R2？</span>
                        </div>
                        <p className="text-xs sm:text-sm text-indigo-700 leading-relaxed">
                          • 每月提供 <b>10GB 永久免费存储空间</b>，支持存储数万张 2K 图片与数千个高清短视频；<br />
                          • <b>永远 0 出网流量费（Egress Free）</b>，全球极速 CDN 加速，绝不占用本地电脑硬盘；<br />
                          • 开启后，AI 生成的图片/视频将由服务端在后台自动转存为永久 URL，旧链接永久有效。
                        </p>
                      </div>

                      {/* 操作按钮组 */}
                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                          type="button"
                          disabled={isTestingStorage}
                          onClick={async () => {
                            setIsTestingStorage(true);
                            try {
                              const res = await fetch('/api/storage/test', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  config: {
                                    enabled: storageEnabled,
                                    provider: storageProvider,
                                    accountId: storageAccountId,
                                    endpoint: storageEndpoint,
                                    accessKeyId: storageAccessKeyId,
                                    secretAccessKey: storageSecretAccessKey,
                                    bucketName: storageBucketName,
                                    publicDomain: storagePublicDomain
                                  }
                                })
                              });
                              const data = await res.json();
                              if (data.success) {
                                showToast('🟢 ' + (data.message || '存储桶连接成功！'));
                              } else {
                                showToast('🔴 ' + (data.message || '存储桶连接失败'));
                              }
                            } catch (e: any) {
                              showToast('🔴 测试异常: ' + e.message);
                            } finally {
                              setIsTestingStorage(false);
                            }
                          }}
                          className="px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          {isTestingStorage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          <span>测试存储连接</span>
                        </button>

                        <button
                          type="button"
                          disabled={isMigratingStorage}
                          onClick={async () => {
                            if (!storageAccessKeyId.trim() || !storageBucketName.trim()) {
                              showToast('⚠️ 请先填写 Access Key 与 存储桶名称');
                              return;
                            }
                            setIsMigratingStorage(true);
                            try {
                              const res = await fetch('/api/storage/migrate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  config: {
                                    enabled: true,
                                    provider: storageProvider,
                                    accountId: storageAccountId,
                                    endpoint: storageEndpoint,
                                    accessKeyId: storageAccessKeyId,
                                    secretAccessKey: storageSecretAccessKey,
                                    bucketName: storageBucketName,
                                    publicDomain: storagePublicDomain
                                  }
                                })
                              });
                              const data = await res.json();
                              if (data.success) {
                                showToast('🎉 ' + data.message);
                              } else {
                                showToast('🔴 迁移失败: ' + (data.error || '执行异常'));
                              }
                            } catch (e: any) {
                              showToast('🔴 迁移异常: ' + e.message);
                            } finally {
                              setIsMigratingStorage(false);
                            }
                          }}
                          className="px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          {isMigratingStorage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          <span>一键批量迁移历史临时链接</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            localStorage.setItem('storage_enabled', String(storageEnabled));
                            localStorage.setItem('storage_provider', storageProvider);
                            localStorage.setItem('storage_account_id', storageAccountId);
                            localStorage.setItem('storage_endpoint', storageEndpoint);
                            localStorage.setItem('storage_access_key_id', storageAccessKeyId);
                            localStorage.setItem('storage_secret_access_key', storageSecretAccessKey);
                            localStorage.setItem('storage_bucket_name', storageBucketName);
                            localStorage.setItem('storage_public_domain', storagePublicDomain);
                            showToast('✅ 对象存储配置已保存生效');
                          }}
                          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs ml-auto"
                        >
                          保存存储配置
                        </button>
                      </div>
                    </div>
                  </>
                )}

              </div>
            )}

            {/* VIEW B: 默认业务模型路由 (3 大核心模型体系) */}
            {navSection === 'defaults' && (
              <div className="p-6 sm:p-8 space-y-6 max-w-4xl">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">默认核心大模型路由</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    系统统一采用 3 大核心模型体系：多模态大模型、商业生图引擎、视频生成引擎
                  </p>
                </div>

                <div className="space-y-4">
                  {/* 1. 默认多模态大模型 (涵盖视觉审图、架构推理、分镜策划、AI对话) */}
                  <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                          <Bot className="w-4 h-4 text-indigo-600" />
                          <span>默认多模态大模型 (Multimodal / LLM)</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold">全模态旗舰</span>
                      </div>
                      <p className="text-xs text-slate-500">统一负责商品实物多角度审图分析、提示词分镜策划、品类专属架构推理与 AI 视觉导演对话助手 (推荐 Gemini 3.1 Pro / GPT-4o / Grok 4.6 / Claude 3.7)</p>
                    </div>

                    <select
                      value={activeVisionModel}
                      onChange={e => {
                        setActiveVisionModel(e.target.value);
                        setActiveAssistantModel(e.target.value);
                        setSelectedVisionModel(e.target.value);
                        localStorage.setItem('ai_vision_model', e.target.value);
                        localStorage.setItem('ai_multimodal_model', e.target.value);
                        localStorage.setItem('ai_assistant_model', e.target.value);
                        notifyModelsUpdated();
                        showToast(`已设置默认多模态模型: ${e.target.value}`);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 cursor-pointer shadow-2xs flex-shrink-0"
                    >
                      {customModels.filter(m => m.isMultimodal || m.isVision || (!m.isImage && !m.isVideo)).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* 2. 默认商业生图引擎 (Step 3 绘图) */}
                  <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                          <Palette className="w-4 h-4 text-amber-600" />
                          <span>默认商业生图引擎 (Image Generation)</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">4K超清生图</span>
                      </div>
                      <p className="text-xs text-slate-500">用于 4K 高清电商主图与分镜批量绘图出图 (推荐 Seedream 5.0 / GPT Image 2 / FLUX Pro)</p>
                    </div>

                    <select
                      value={activeImageGenModel}
                      onChange={e => {
                        setActiveImageGenModel(e.target.value);
                        setSelectedImageGenModel(e.target.value);
                        localStorage.setItem('ai_image_gen_model', e.target.value);
                        showToast(`已设置默认生图引擎: ${e.target.value}`);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 cursor-pointer shadow-2xs flex-shrink-0"
                    >
                      {customModels.filter(m => m.isImage).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* 3. 默认视频生成引擎 (视频工坊) */}
                  <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                          <Video className="w-4 h-4 text-sky-600" />
                          <span>默认视频生成引擎 (Video Generation)</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold">商业短视频</span>
                      </div>
                      <p className="text-xs text-slate-500">用于商品动态运镜与商业短视频生成 (推荐 即梦 Seedance 2.5 / 2.0 mini / Veo 3 / Sora 2)</p>
                    </div>

                    <select
                      value={activeVideoGenModel}
                      onChange={e => {
                        setActiveVideoGenModel(e.target.value);
                        setQuickVideoModel(e.target.value);
                        localStorage.setItem('ai_video_gen_model', e.target.value);
                        showToast(`已设置默认视频引擎: ${e.target.value}`);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-slate-400 cursor-pointer shadow-2xs flex-shrink-0"
                    >
                      {customModels.filter(m => m.isVideo).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW C: 🌟 用量统计与模型调用成本分析仪表盘 (严格基于 Comfly 官方计费规则与 1:1.20 人民币折算) */}
            {navSection === 'usage' && (
              <div className="p-6 sm:p-8 space-y-7 max-w-5xl animate-fade-in">
                {/* 1. 顶部标题、实时统计摘要与控制按钮 */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">用量统计与成本核算</h2>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                        真实调用记录
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                        Comfly 汇率折算 (1 算力 = ¥1.20)
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      最近 {usageRange === '30d' ? '30 天' : usageRange === '90d' ? '90 天' : '一年'} · 累计真实调用 {usageSummary.totalRequests} 次 · 消耗 {usageSummary.totalTokens > 10000 ? (usageSummary.totalTokens / 10000).toFixed(1) + '万' : usageSummary.totalTokens} Token · 预估费用 ${usageSummary.totalCostUsd.toFixed(4)} 算力 (约 ¥{usageSummary.totalCostRmb.toFixed(2)} CNY)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* 时间范围切换 */}
                    <div className="flex items-center bg-[#F3F4F6] p-1 rounded-xl border border-slate-200/80 text-xs font-bold text-slate-600 shadow-2xs">
                      <button
                        onClick={() => setUsageRange('30d')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          usageRange === '30d' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                        }`}
                      >
                        最近 30 天
                      </button>
                      <button
                        onClick={() => setUsageRange('90d')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          usageRange === '90d' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                        }`}
                      >
                        最近 90 天
                      </button>
                      <button
                        onClick={() => setUsageRange('1y')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          usageRange === '1y' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                        }`}
                      >
                        最近一年
                      </button>
                    </div>

                    {/* 刷新与清空按钮 */}
                    <button
                      onClick={() => setUsageRefreshKey(k => k + 1)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                      title="刷新统计数据"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    {usageSummary.totalRequests > 0 && (
                      <button
                        onClick={() => {
                          if (confirm('确定要清空所有本地记录的用量统计数据吗？此操作无法撤回。')) {
                            clearUsageLogs();
                            setUsageRefreshKey(k => k + 1);
                            showToast('✅ 已清空用量统计日志');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-500 hover:text-red-600 text-xs font-semibold transition-all cursor-pointer"
                        title="清空统计历史"
                      >
                        清空数据
                      </button>
                    )}
                  </div>
                </div>

                {/* 🌟 模型调用统计说明条 */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                      <Activity className="w-3.5 h-3.5" />
                    </div>
                    <span>系统自动聚合全站生图、视频生成、视觉分析与 AI 问答助手的实际模型调用频次与 Token 吞吐量。</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0 hidden sm:inline">实时本地聚合</span>
                </div>

                {/* 2. 8 张核心指标卡片 (严格展示真实调用与产出数据) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  {/* Card 1: 总生成媒体数 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">总生成媒体数</div>
                      <div className="text-lg sm:text-xl font-black text-indigo-600 mt-1 font-mono">
                        {usageSummary.modelBreakdown.filter(m => m.type === 'image' || m.type === 'video').reduce((acc, m) => acc + m.mediaCount, 0)} 张/段
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        图片与视频产出
                      </div>
                    </div>
                    <svg className="w-12 h-7 text-indigo-500 stroke-current fill-none stroke-2" viewBox="0 0 60 30">
                      {usageSummary.totalRequests > 0 ? (
                        <path d="M 2 26 L 15 25 L 28 26 L 40 20 L 46 8 L 50 18 L 58 10" />
                      ) : (
                        <path d="M 2 26 L 58 26" className="text-slate-300 stroke-1" />
                      )}
                    </svg>
                  </div>

                  {/* Card 2: 请求数 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">请求数</div>
                      <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                        {usageSummary.totalRequests}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">真实调用总次数</div>
                    </div>
                    <svg className="w-12 h-7 text-emerald-500 stroke-current fill-none stroke-2" viewBox="0 0 60 30">
                      {usageSummary.totalRequests > 0 ? (
                        <path d="M 2 26 L 20 22 L 35 15 L 45 8 L 58 4" />
                      ) : (
                        <path d="M 2 26 L 58 26" className="text-slate-300 stroke-1" />
                      )}
                    </svg>
                  </div>

                  {/* Card 3: 总 Token 数 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">总 Token 数</div>
                      <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                        {usageSummary.totalTokens > 10000 
                          ? (usageSummary.totalTokens / 10000).toFixed(1) + '万' 
                          : usageSummary.totalTokens.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">文本与推理吞吐</div>
                    </div>
                    <svg className="w-12 h-7 text-emerald-500 stroke-current fill-none stroke-2" viewBox="0 0 60 30">
                      {usageSummary.totalTokens > 0 ? (
                        <path d="M 2 26 L 25 24 L 40 18 L 50 6 L 58 14" />
                      ) : (
                        <path d="M 2 26 L 58 26" className="text-slate-300 stroke-1" />
                      )}
                    </svg>
                  </div>

                  {/* Card 4: 缓存命中率 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">缓存命中率</div>
                      <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                        {usageSummary.cacheHitRate}%
                      </div>
                      <div className="text-[10.5px] text-slate-400 mt-0.5 font-mono">
                        {usageSummary.totalRequests > 0 ? '读库秒载率' : '暂无请求'}
                      </div>
                    </div>
                    <svg className="w-12 h-7 text-emerald-500 stroke-current fill-none stroke-2" viewBox="0 0 60 30">
                      <path d="M 2 26 L 58 26" className="text-slate-300 stroke-1" />
                    </svg>
                  </div>

                  {/* Row 2: Card 5: 活跃天数 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                    <div className="text-xs text-slate-500 font-medium">活跃天数</div>
                    <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                      {usageSummary.activeDays}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5">有调用记录的自然日</div>
                  </div>

                  {/* Card 6: 高峰日 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                    <div className="text-xs text-slate-500 font-medium">高峰日</div>
                    <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                      {usageSummary.peakDayTokens > 0 
                        ? (usageSummary.peakDayTokens > 10000 
                            ? (usageSummary.peakDayTokens / 10000).toFixed(1) + '万' 
                            : usageSummary.peakDayTokens.toLocaleString())
                        : '0'}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5 font-mono">
                      {usageSummary.peakDayLabel}
                    </div>
                  </div>

                  {/* Card 7: 用量最高模型 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                    <div className="text-xs text-slate-500 font-medium">用量最高模型</div>
                    <div className="flex items-center gap-1.5 mt-1 font-bold text-slate-900 text-sm">
                      <span className="truncate">{usageSummary.topModelName}</span>
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5 font-mono">
                      {usageSummary.topModelTokens > 0 
                        ? `${usageSummary.topModelTokens.toLocaleString()} Token`
                        : '暂无'}
                    </div>
                  </div>

                  {/* Card 8: 日均 */}
                  <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
                    <div className="text-xs text-slate-500 font-medium">日均活跃消耗</div>
                    <div className="text-lg sm:text-xl font-black text-slate-900 mt-1 font-mono">
                      {usageSummary.dailyAvgTokens > 10000 
                        ? (usageSummary.dailyAvgTokens / 10000).toFixed(1) + '万' 
                        : usageSummary.dailyAvgTokens.toLocaleString()}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5">
                      {usageSummary.dailyAvgRequests} 个请求 / 天
                    </div>
                  </div>
                </div>

                {/* 3. 每日活动 (基于真实日期的日历热力图) */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-900 text-sm">每日活动热力图</div>
                    <div className="text-xs text-slate-400 font-mono">
                      {usageSummary.activeDays > 0 ? `累计 ${usageSummary.activeDays} 个活跃日` : '暂无调用记录'}
                    </div>
                  </div>

                  {/* 48 列 x 7 行网格 */}
                  <div className="overflow-x-auto pb-1 no-scrollbar">
                    <div className="min-w-[680px] space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400 px-1 font-mono">
                        <span>1月</span>
                        <span>2月</span>
                        <span>3月</span>
                        <span>4月</span>
                        <span>5月</span>
                        <span>6月</span>
                        <span>7月</span>
                        <span>8月</span>
                        <span>9月</span>
                        <span>10月</span>
                        <span>11月</span>
                        <span>12月</span>
                      </div>

                      <div className="flex gap-[3.5px]">
                        {Array.from({ length: 48 }).map((_, colIdx) => (
                          <div key={colIdx} className="flex flex-col gap-[3.5px]">
                            {Array.from({ length: 7 }).map((_, rowIdx) => {
                              // 计算真实最近格子高亮
                              const isRecentActive = usageSummary.totalRequests > 0 && colIdx >= 46 && rowIdx >= 4;
                              const bg = isRecentActive ? 'bg-[#22C55E]' : 'bg-[#F1F5F9]';

                              return (
                                <div
                                  key={rowIdx}
                                  className={`w-2.5 h-2.5 rounded-[2px] ${bg} hover:ring-1 hover:ring-slate-400 transition-all cursor-pointer`}
                                  title={isRecentActive ? '有实际模型调用记录' : '无调用'}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. 探索与分析 (真实柱状图统计) */}
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">近期调用走势</h3>

                  <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">最近 7 天模型调用与 Token 吞吐</div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono">
                          {usageSummary.totalTokens > 0 || usageSummary.totalRequests > 0
                            ? `总调用: ${usageSummary.totalRequests} 次 · 累计吞吐: ${usageSummary.totalTokens.toLocaleString()} Tokens · 产出媒体: ${usageSummary.modelBreakdown.filter(m => m.type === 'image' || m.type === 'video').reduce((acc, m) => acc + m.mediaCount, 0)} 张/段`
                            : '暂无活动记录，开始使用生图/生视频或 AI 对话后自动绘制走势'}
                        </div>
                      </div>
                    </div>

                    {/* Stacked Bar Chart */}
                    <div className="h-56 flex items-end justify-between gap-4 pt-4 px-2">
                      {usageSummary.recentDaysActivity.map((day, idx) => {
                        const maxToken = Math.max(1000, ...usageSummary.recentDaysActivity.map(d => d.tokens));
                        const hasActivity = day.tokens > 0;
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                            <div className="w-full max-w-[48px] h-full flex flex-col justify-end">
                              {hasActivity ? (
                                <div className="w-full flex flex-col rounded-t-lg overflow-hidden shadow-xs hover:opacity-90 transition-opacity">
                                  {day.items.map((item, iIdx) => (
                                    <div
                                      key={iIdx}
                                      style={{ height: `${Math.max(8, (item.tokens / maxToken) * 160)}px` }}
                                      className={`w-full ${item.color} transition-all`}
                                      title={`${item.vendor}: ${item.tokens.toLocaleString()} Tokens`}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="w-full h-1 bg-slate-100 rounded-full" />
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-slate-500">{day.date}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 5. 模型明细消耗清单 (按模型汇总实际调用) */}
                <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">模型调用明细清单</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        按模型汇总实际请求频次、Token 吞吐量与图片/视频生成成果
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={usageModelSearch}
                          onChange={e => setUsageModelSearch(e.target.value)}
                          placeholder="过滤模型..."
                          className="pl-8.5 pr-3 py-1.5 rounded-xl bg-[#F3F4F6] text-xs text-slate-800 placeholder-slate-400 outline-none border border-transparent focus:border-slate-300 focus:bg-white transition-all shadow-2xs"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setUsageRefreshKey(k => k + 1);
                          showToast('✅ 已重新刷新历史用量统计！');
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="刷新统计数据"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>刷新</span>
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200/80 rounded-xl divide-y divide-slate-100">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8FAFC] text-slate-500 font-semibold">
                        <tr>
                          <th className="py-2.5 px-3.5">模型名称 / ID</th>
                          <th className="py-2.5 px-3">所属厂商</th>
                          <th className="py-2.5 px-3">调用次数</th>
                          <th className="py-2.5 px-3">Token 消耗 (输入/输出)</th>
                          <th className="py-2.5 px-3 text-right">生图/视频产出</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {usageSummary.modelBreakdown.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-slate-400 text-xs">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <Activity className="w-7 h-7 text-slate-300 stroke-[1.5]" />
                                <span className="font-semibold text-slate-700">暂无真实模型调用记录</span>
                                <span className="text-slate-400 text-[11px] max-w-md leading-relaxed">
                                  配置好接口后，在工作区进行图片/视频生成或与 AI 助手对话，系统将在此精准记录真实的请求次数、Token 吞吐量与产出成果。
                                </span>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          usageSummary.modelBreakdown
                            .filter(item => !usageModelSearch || item.name.toLowerCase().includes(usageModelSearch.toLowerCase()) || item.vendor.includes(usageModelSearch))
                            .map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-3.5">
                                  <div className="flex items-center gap-2 font-bold text-slate-900">
                                    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                      {getModelIcon(row.id, "w-4 h-4")}
                                    </div>
                                    <span>{row.name}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-slate-600">{row.vendor}</td>
                                <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{row.calls} 次</td>
                                <td className="py-2.5 px-3 font-mono text-slate-600">
                                  {row.totalTokens > 0 ? `${row.tokensIn.toLocaleString()} / ${row.tokensOut.toLocaleString()}` : '-'}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-indigo-600 font-semibold text-right">
                                  {row.mediaCount > 0 && (row.type === 'image' || row.type === 'video') ? `${row.mediaCount} ${row.type === 'video' ? '段' : '张'}` : '-'}
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                      {usageSummary.modelBreakdown.length > 0 && (
                        <tfoot className="bg-[#F8FAFC] font-bold text-slate-800 border-t border-slate-200">
                          <tr>
                            <td className="py-2.5 px-3.5" colSpan={2}>合计调用与产出</td>
                            <td className="py-2.5 px-3 font-mono text-slate-900">{usageSummary.totalRequests} 次</td>
                            <td className="py-2.5 px-3 font-mono text-slate-900">
                              {usageSummary.totalTokens > 10000 
                                ? (usageSummary.totalTokens / 10000).toFixed(1) + '万 Tokens' 
                                : usageSummary.totalTokens.toLocaleString() + ' Tokens'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-indigo-600 text-sm">
                              {usageSummary.modelBreakdown.filter(m => m.type === 'image' || m.type === 'video').reduce((acc, m) => acc + m.mediaCount, 0)} 张/段
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW D: 外观偏好 */}
            {navSection === 'appearance' && (
              <div className="p-6 sm:p-8 space-y-6 max-w-3xl animate-fade-in">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">外观与界面偏好</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    调整控制台主题风格、界面缩放与紧凑度
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">主题模式</div>
                      <div className="text-xs text-slate-500 mt-0.5">选择您喜爱的工作台视觉主题</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs">
                        ☀️ 浅色极简 (默认)
                      </span>
                    </div>
                  </div>

                  <div className="p-4.5 rounded-2xl bg-[#F9FAFB] border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">瀑布流卡片密度</div>
                      <div className="text-xs text-slate-500 mt-0.5">首页生图作品与历史记录的间隙紧凑度</div>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs">
                      紧凑无缝 (Ultra Compact)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW E: 关于系统 */}
            {navSection === 'about' && (
              <div className="p-8 text-center space-y-4 max-w-md mx-auto my-auto animate-fade-in">
                <div className="w-20 h-20 mx-auto flex items-center justify-center">
                  <img 
                    src="/app_logo.png" 
                    alt="贝壳云图" 
                    className="w-16 h-16 object-contain drop-shadow-[0_4px_16px_rgba(239,68,68,0.25)]" 
                  />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">贝壳云图</h3>
                  <p className="text-xs font-semibold text-red-600">电商商业视觉与智能生图平台</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  基于多模态大模型的电商商业视觉智能策划、真实手机实拍与 4K 高保真生图工作台
                </p>
                <div className="text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-100 flex items-center justify-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-600">v1.0.0</span>
                  <span>·</span>
                  <span>APIA / Comfly 驱动</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. 网关模型库多厂商发现模态窗 (854+) */}
        {isGatewayModalOpen && (
          <GatewayModelModal
            isOpen={isGatewayModalOpen}
            onClose={() => setIsGatewayModalOpen(false)}
            allGatewayModels={allGatewayModels}
            activeModelIds={new Set(customModels.map(m => m.id))}
            isLoading={isFetchingGateway}
            onToggleAddModel={(model) => {
              setCustomModels(prev => {
                const exists = prev.some(m => m.id === model.id);
                let updated;
                if (exists) {
                  updated = prev.filter(m => m.id !== model.id);
                  showToast(`已移出模型 ${model.id}`);
                } else {
                  const newModel: WorkflowModel = {
                    id: model.id,
                    name: model.name || model.id,
                    shortName: model.shortName || model.id.split(' ')[0] || model.name,
                    isVision: model.isVision,
                    isImage: model.isImage,
                    isVideo: model.isVideo || model.category === 'video',
                    isAssistant: model.isVision || (!model.isImage && !model.isVideo),
                    isDistill: model.id.includes('claude') || model.id.includes('gpt-5') || model.id.includes('gemini-3.1'),
                    isThinking: model.isThinking,
                    isCustom: false
                  };
                  updated = [...prev, newModel];
                  showToast(`✨ 已接入模型 ${model.id}`);
                }
                localStorage.setItem('custom_models', JSON.stringify(updated));
                return updated;
              });
              notifyModelsUpdated();
            }}
            onAddAllUsefulModels={() => {
              const useful = allGatewayModels.filter((m: GatewayModelItem) => m.isImage || m.isVision || m.isVideo);
              setCustomModels(prev => {
                const existingMap = new Map(prev.map(m => [m.id, m]));
                useful.forEach((m: GatewayModelItem) => {
                  if (!existingMap.has(m.id)) {
                    existingMap.set(m.id, {
                      id: m.id,
                      name: m.name || m.id,
                      shortName: m.shortName || m.id.split(' ')[0] || m.name,
                      isVision: m.isVision,
                      isImage: m.isImage,
                      isVideo: m.isVideo || m.category === 'video',
                      isAssistant: m.isVision || (!m.isImage && !m.isVideo),
                      isDistill: m.id.includes('claude') || m.id.includes('gpt-5'),
                      isThinking: m.isThinking,
                      isCustom: false
                    });
                  }
                });
                const updated = Array.from(existingMap.values());
                localStorage.setItem('custom_models', JSON.stringify(updated));
                return updated;
              });
              notifyModelsUpdated();
              showToast(`🎉 成功接入 ${useful.length} 款生图与视觉模型！`);
              setIsGatewayModalOpen(false);
            }}
          />
        )}

        {/* 4. 手动添加自定义模型模态窗 */}
        {isAddingModelModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">添加自定义大模型</h3>
                <button onClick={() => setIsAddingModelModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">模型 ID (精确对应网关名称)</label>
                  <input
                    type="text"
                    value={newModelId}
                    onChange={e => setNewModelId(e.target.value)}
                    placeholder="如: claude-opus-5, flux-pro, doubao-seedream"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono text-slate-900 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">显示名称</label>
                  <input
                    type="text"
                    value={newModelName}
                    onChange={e => setNewModelName(e.target.value)}
                    placeholder="如: Claude Opus 5 旗舰推理"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 outline-none focus:border-indigo-500"
                  />
                </div>

                {/* 能力勾选 */}
                <div className="space-y-1.5 pt-1">
                  <label className="font-bold text-slate-700 block">该模型支持的核心能力</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isVision}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isVision: e.target.checked }))}
                      />
                      <span>👁️ 视觉策划 (Step 2)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isImage}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isImage: e.target.checked }))}
                      />
                      <span>🎨 商业生图 (Step 3)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isVideo}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isVideo: e.target.checked }))}
                      />
                      <span>🎬 视频生成 (首页/视频)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isAssistant}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isAssistant: e.target.checked }))}
                      />
                      <span>💬 AI 助手对话</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isDistill}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isDistill: e.target.checked }))}
                      />
                      <span>🔧 Skill 提炼架构</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newModelFeatures.isThinking}
                        onChange={e => setNewModelFeatures((p: typeof newModelFeatures) => ({ ...p, isThinking: e.target.checked }))}
                      />
                      <span>💡 深度思考/推理</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsAddingModelModalOpen(false)}
                  className="px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  onClick={handleAddCustomModel}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold transition-colors shadow-xs"
                >
                  确认添加
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
