/**
 * 视频带货共享领域类型定义
 */

/** 视频模式：决定画面生成策略与视觉管线 */
export type VideoSalesMode =
  | 'product_closeup'   // 产品特写：商品原图 + Ken Burns 运动特效，全程无 AI 假脸，真实感最高
  | 'graphic_montage'   // 图文混剪：商品图 + 动态文字大字卡片 + 紧凑转场
  | 'scene_demo'        // 场景演示：AI 生成手部使用/背影/道具场景，规避人脸失真
  | 'live_presenter';   // 真人出镜：角色人物出镜讲解（结合人物库或用户上传素材）

/** 商品品类 */
export type VideoSalesCategory = 'beauty' | 'food' | 'home' | 'fashion' | 'tech' | 'other';

/** 服饰成片叙事。只在服饰鞋包使用。 */
export type VideoSalesFashionBeat = 'unbox' | 'lifestyle' | 'accessory';

/** 分镜类型 (AIDA 销售链路) */
export type VideoSalesShotType =
  | 'hook'            // 黄金3秒钩子（留存）
  | 'pain_point'      // 痛点共鸣（唤醒）
  | 'product_reveal'  // 救星登场（吸引）
  | 'demo'            // 体验展示（信任）
  | 'social_proof'    // 销量评价（背书）
  | 'cta';            // 促销引导（转化）

/** 素材来源策略 */
export type VideoSalesVisualSource = 'product_image' | 'ai_generate' | 'user_upload' | 'avatar_presenter';

/** 转场衔接方式 */
export type VideoSalesTransition =
  | 'ai_start_end'    // AI 首尾帧过渡 (Vidu/Kling)
  | 'ai_reference'    // AI 参考图衔接
  | 'direct_concat'   // 硬切直接拼接
  | 'ffmpeg_fade';    // FFmpeg 交叉淡入淡出

/** 商品原图运动效果 (FFmpeg zoompan) */
export type VideoSalesMotion =
  | 'zoom_in_slow'    // 缓慢推近细节
  | 'zoom_out_slow'   // 缓慢拉远全貌
  | 'pan_left'        // 镜头向左平移
  | 'pan_right'       // 镜头向右平移
  | 'ken_burns'       // 经典推近并轻微漂移
  | 'static';         // 静止定格

/** 文字叠加卡片样式 */
export interface VideoSalesTextOverlay {
  text: string;
  style: 'title' | 'subtitle' | 'highlight' | 'price';
}

/** 单个分镜定义 */
export interface VideoSalesShot {
  shotId: number;
  type: VideoSalesShotType;
  duration: number; // 秒 (通常 2-8s)
  description: string; // 画面构图与动态描述
  camera: string; // 运镜描述（如：特写推近、俯拍全景）
  visualSource: VideoSalesVisualSource;
  transition: VideoSalesTransition;
  voiceover: string; // 播报文案。服饰每段同时写卖点和看点，约每秒 4.7–6.7 字，15 秒为 70–100 字；其他品类约每秒 3–4 字
  prompt?: string; // 图生视频画面提示词，不包含字幕或大字
  imagePrompt?: string; // 场景镜静帧绘图提示词，按该镜脚本写成
  finalPrompt?: string;
  selectionReason?: string;
  promptStale?: boolean;
  imageIndex?: number; // 采集图目录中的参考图编号
  referenceFrameUrl?: string; // 重绘完成后、提交视频前保存的场景参考图
  motion?: VideoSalesMotion; // 仅 product_image 有效
  textOverlay?: VideoSalesTextOverlay;
  characterId?: string; // 关联出镜人物
  avatarVoiceId?: string;
  audioUrl?: string;
  assetUrl?: string; // 实际使用的图片或视频 URL
  taskId?: string;
  modelDuration?: number;
  failReason?: string;
  status?: 'pending' | 'redrawing' | 'generating' | 'done' | 'failed' | 'uncertain';
}

/** 针对短视频算法的 SEO 交付物料 */
export interface VideoSalesSeo {
  title: string; // 标题（15字以内）
  hashtags: string[]; // 话题标签
  coverText: string; // 封面吸睛大字（8字以内）
  interactionGuide: string; // 评论区/收藏互动引导语
  description: string; // 发布描述详情（50字以内）
}

import type { SalesCreativeAsset, SalesVideoSnapshot } from './workflowTypes';

/** 单套生成脚本 */
export interface VideoSalesScript {
  id: string;
  title: string;
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
  renderSnapshot?: SalesVideoSnapshot;
  renderResultUrl?: string;
  renderError?: string;
  fullPrompt?: string;
  personImagePrompt?: string;
  sceneImagePrompt?: string;
  personFrameUrl?: string;
  sceneFrameUrl?: string;
  renderTaskId?: string;
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

