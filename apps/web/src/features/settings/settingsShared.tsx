
import React from 'react';
import { Database, Image } from 'lucide-react';
import { ComflyLogo, OneBoundLogo, ApiaLogo, QiyunLogo } from '@/shared/icons';
import { ModelIcon } from '@/shared/ui/ModelIcons';
import { APPROVED_MODELS } from '@beike/domain/modelCatalog';

export interface WorkflowModel {
  id: string;
  name: string;
  shortName: string;
  badge?: string;
  desc?: string;
  isMultimodal?: boolean;
  isImage: boolean;
  isVideo: boolean;
  isVision?: boolean;
  isAssistant?: boolean;
  isDistill?: boolean;
  isThinking?: boolean;
  isCustom?: boolean;
}

export const DEFAULT_PRESET_MODELS: WorkflowModel[] = APPROVED_MODELS.map((m) => ({
  id: m.id,
  name: m.name,
  shortName: m.shortName,
  badge: m.badge,
  desc: m.description,
  isMultimodal: m.capability === 'multimodal',
  isVision: m.capability === 'multimodal',
  isImage: m.capability === 'image',
  isVideo: m.capability === 'video',
  isAssistant: m.capability === 'multimodal',
  isDistill: m.capability === 'multimodal',
  isThinking: Boolean(m.isThinking),
  isCustom: false,
}));

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
  {
    id: 'comfly_gateway',
    name: 'Comfly AI 智能大模型网关',
    subTitle: 'OpenAI Compatible · 批准模型聚合',
    category: 'core',
    renderLogo: (cls = "w-5 h-5") => <ComflyLogo className={cls} />,
    isEnabled: true,
    tag: '大模型主网关',
    docsUrl: 'https://gpt-best.apifox.cn',
    registerUrl: 'https://ai.comfly.org',
    registerName: '前往 Comfly 官网注册并获取 Key',
    defaultBaseUrl: 'https://ai.comfly.org',
    description: '企业级大模型聚合网关，单 API Key 统一调度白名单内生图、生视频与多模态模型。',
    capabilities: ['白名单模型', '高并发负载均衡', '自动容灾切换', '官方原生流式响应']
  },
  {
    id: 'deepseek_official',
    name: 'DeepSeek 官方接口',
    subTitle: 'OpenAI Compatible · 图像理解 / 对话',
    category: 'core',
    renderLogo: (cls = "w-5 h-5") => <ModelIcon modelId="deepseek-flash" className={cls} />,
    isEnabled: true,
    tag: 'DeepSeek 原生',
    docsUrl: 'https://api-docs.deepseek.com/zh-cn/guides/images',
    registerUrl: 'https://platform.deepseek.com',
    registerName: '前往 DeepSeek Platform 获取 API Key',
    defaultBaseUrl: 'https://api.deepseek.com',
    description: '使用 DeepSeek 官方 OpenAI 兼容接口；启用后会将当前文本/图像理解模型请求切换到 DeepSeek。',
    capabilities: ['Chat Completions', '图像理解', 'deepseek-flash', 'Bearer API Key']
  },
  {
    id: 'lianchi_images',
    name: '联池图像接口',
    subTitle: 'GAPNET · OpenAI Images 兼容',
    category: 'core',
    renderLogo: (cls = 'w-5 h-5') => <Image className={cls} />,
    isEnabled: true,
    tag: '文生图 / 图像编辑',
    defaultBaseUrl: 'https://api.gapnet.ai/endpoint',
    description: '独立调用 openai/gpt-image-2；生成使用 JSON，编辑使用 multipart 图片上传。',
    capabilities: ['Images Generations', 'Images Edits', 'Bearer API Key'],
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
    id: 'qiyun_parser',
    name: '奇云解析',
    subTitle: 'https://qyapi.ipaybuy.cn · 抖音/小红书/视频号/快手/B站/微博等',
    category: 'social',
    renderLogo: (cls = "w-5 h-5") => <QiyunLogo className={cls} />,
    isEnabled: true,
    tag: '30+平台去水印',
    docsUrl: 'https://qyapi.ipaybuy.cn',
    registerUrl: 'https://qyapi.ipaybuy.cn',
    registerName: '前往奇云平台注册并申请 AppId',
    defaultBaseUrl: 'https://qyapi.ipaybuy.cn/api/video',
    description: '全能短视频与图集去水印 RESTful API，支持抖音、快手、小红书、微信视频号、微博、B站等 30+ 主流短视频与图集平台一键解析无水印资源。',
    capabilities: ['支持 30+ 平台', '抖音/快手/小红书', '微信视频号', '图集与实况视频', '毫秒级解析']
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
