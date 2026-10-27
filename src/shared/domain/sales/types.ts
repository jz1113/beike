/**
 * 电商视频共享领域类型定义
 */

export interface SalesColorSelection {
  variantId?: string;
  colorLabel: string;
  confirmedImageUrls: string[];
  excludedImageUrls: string[];
}

export interface SalesCreativeAsset {
  id: string;
  kind: 'person' | 'face' | 'scene' | 'keyframe';
  label: string;
  prompt: string;
  required: boolean;
  referenceAssetIds?: string[];
  usesProduct?: boolean;
  /** 商品目录原始编号，按本张静帧的目标视角选择；不等同于分镜选图。 */
  productImageIndexes?: number[];
  url?: string;
  status?: 'pending' | 'generating' | 'done' | 'failed' | 'uncertain';
  validation?: 'pending' | 'passed' | 'conflict' | 'uncertain';
  validationSource?: 'manual' | 'model';
  validationReason?: string;
  error?: string;
  sourceRevision?: string;
  taskId?: string;
  submissionKey?: string;
  modelId?: string;
  attempts?: number;
}

export interface SalesActualReference {
  id: string;
  kind: SalesCreativeAsset['kind'] | 'product';
  label: string;
  url: string;
}

export interface SalesVideoSnapshot {
  skillId?: string;
  skillRevision?: string;
  model: string;
  prompt: string;
  images: string[];
  duration: number;
  aspectRatio: string;
  resolution: string;
  refMode: string;
  submissionKey?: string;
}

/** 视频模式：决定画面生成策略与视觉管线 */
export type VideoSalesMode =
  | 'product_closeup'   // 商品展示，正常距离与比例，使用画外音
  | 'graphic_montage'   // 商品画面剪辑，使用画外音，全程无字幕
  | 'scene_demo'        // 手部或背影展示，使用画外音
  | 'live_presenter';   // 按脚本生成同一成年人物，现场讲解并同步口型

/** 商品品类 */
export type VideoSalesCategory = 'beauty' | 'food' | 'home' | 'fashion' | 'tech' | 'other';

/** 服饰成片叙事。只在服饰鞋包使用。 */
export type VideoSalesFashionBeat = 'unbox' | 'lifestyle' | 'accessory';

/** 分镜类型 (AIDA 销售链路) */
export type VideoSalesShotType =
  | 'hook'            // 黄金3秒钩子（留存）
  | 'detail'          // 商品事实与展示
  | 'closing'         // 穿搭建议与自然收尾
  | 'pain_point'      // 痛点共鸣（唤醒）
  | 'product_reveal'  // 救星登场（吸引）
  | 'demo'            // 体验展示（信任）
  | 'social_proof'    // 销量评价（背书）
  | 'cta';            // 促销引导（转化）

/** 素材来源策略 */
export type VideoSalesVisualSource = 'product_image' | 'ai_generate';

/** 转场衔接方式 */
export type VideoSalesTransition = 'direct_concat';

/** 声音来源：出镜人物现场说话，或明确的画外音。旧脚本可暂未标注。 */
export type VideoSalesSpeechMode = 'on_camera' | 'voiceover';

/** 单个分镜定义 */
export interface VideoSalesShot {
  shotId: number;
  type: VideoSalesShotType;
  duration: number; // 秒 (通常 2-8s)
  description: string; // 画面构图与动态描述
  camera: string; // 按技能确定的机位、正常距离景别与必要运镜
  visualSource: VideoSalesVisualSource;
  transition: VideoSalesTransition;
  speechMode?: VideoSalesSpeechMode;
  voiceover: string; // 台词原文，声音来源由 speechMode 指定。服饰约每秒 2.4–4.6 汉字，日常优先 2.4–3.6，单段不超过每秒约 6 字
  prompt?: string; // 图生视频画面提示词，不包含字幕或大字
  finalPrompt?: string;
  selectionReason?: string;
  promptStale?: boolean;
  imageIndex?: number; // 采集图目录中的参考图编号
  /** 旧流程数据仅用于历史查看，不参与创作或提交。 */
  historicalData?: Record<string, unknown>;
  assetUrl?: string; // 实际使用的图片或视频 URL
  taskId?: string;
  modelDuration?: number;
  failReason?: string;
  status?: 'pending' | 'generating' | 'done' | 'failed' | 'uncertain';
}

/** 针对短视频算法的 SEO 交付物料 */
export interface VideoSalesSeo {
  title: string; // 标题（15字以内）
  hashtags: string[]; // 话题标签
  coverText: string; // 封面吸睛大字（8字以内）
  interactionGuide: string; // 评论区/收藏互动引导语
  description: string; // 发布描述详情（50字以内）
}



/** 单套生成脚本 */
export interface VideoSalesScript {
  id: string;
  title: string;
  skillId?: string;
  skillRevision?: string;
  totalDuration: number; // 秒
  shots: VideoSalesShot[];
  seo: VideoSalesSeo;
  beat?: VideoSalesFashionBeat;
  deliveryMode?: 'single';
  workflowVersion?: 3;
  planRevision?: string;
  planStale?: boolean;
  assets?: SalesCreativeAsset[];
  assetValidation?: 'pending' | 'passed' | 'conflict' | 'uncertain';
  finalizedRevision?: string;
  finalStaleReason?: string;
  renderSnapshot?: SalesVideoSnapshot;
  renderResultUrl?: string;
  renderError?: string;
  fullPrompt?: string;
  historicalData?: Record<string, unknown>;
  renderTaskId?: string;
  renderSubmissionKey?: string;
  renderStatus?: 'pending' | 'generating' | 'done' | 'failed' | 'uncertain';
}

/** 商品视觉分析结果 */
export interface VideoSalesProductAnalysis {
  productName: string;
  category: VideoSalesCategory;
  brand?: string;
  visualFeatures: {
    mainColor: string;
    designStyle: string;
    productForm: string;
    texture: string;
  };
  sellingPoints: string[];
  targetAudience: string;
  usageScenarios: string[];
  painPoints: string[];
  videoSuggestions: {
    recommendedAngles: string[];
    keyVisuals: string[];
    suggestedStyle: string;
  };
  knownFacts?: string[];
  creativeNotes?: string[];
  coveredImageCount?: number;
  imageCount?: number;
  degraded?: boolean;
}

