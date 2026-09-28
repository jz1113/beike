/**
 * 分镜预设配置
 * 首页前置「分镜与模型预设」改造 - 预设类型定义
 */

import { domainStorage } from '../../core/runtime';

export type StoryboardShotType = 
  | 'single_shot'      // 单张独立分镜
  | 'lifestyle_interaction' // 生活互动场景
  | 'pure_product'     // 纯商品特写
  | 'model_shot';      // 模特展示

export type SceneStyle = 
  | 'studio'    // 室内摄影棚
  | 'lifestyle' // 生活场景
  | 'street'    // 街景
  | 'indoor';   // 室内家居

export interface StoryboardPresetConfig {
  id: string;
  label: string;
  /** 分镜张数 */
  shotCount: 1 | 2 | 3 | 4;
  /** 分镜类型 */
  shotType: StoryboardShotType;
  /** 场景风格 */
  sceneStyle: SceneStyle;
  /** 是否无模特模式 */
  isNoModel: boolean;
  /** 预设描述 */
  description: string;
  /** 图标 emoji */
  icon: string;
}

// 🌟 内置 5 个分镜预设
export const STORYBOARD_PRESETS: StoryboardPresetConfig[] = [
  {
    id: 'single-shot',
    label: '单张出图',
    shotCount: 1,
    shotType: 'single_shot',
    sceneStyle: 'lifestyle',
    isNoModel: false,
    description: '快速生成单张高质量图片，适合单品展示',
    icon: '🖼️',
  },
  {
    id: 'lifestyle-4shot',
    label: '生活场景 4 镜',
    shotCount: 4,
    shotType: 'lifestyle_interaction',
    sceneStyle: 'lifestyle',
    isNoModel: false,
    description: '4 组生活化买家秀分镜，含半身+特写',
    icon: '📸',
  },
  {
    id: 'no-model-4shot',
    label: '无模特 4 镜',
    shotCount: 4,
    shotType: 'pure_product',
    sceneStyle: 'lifestyle',
    isNoModel: true,
    description: '纯商品特写，无人物入镜，适合饰品/箱包',
    icon: '💎',
  },
  {
    id: 'jewelry-macro',
    label: '珠宝特写',
    shotCount: 4,
    shotType: 'pure_product',
    sceneStyle: 'studio',
    isNoModel: true,
    description: '珠宝首饰微距特写，多角度细节展示',
    icon: '✨',
  },
];

/** localStorage 持久化键名 */
export const STORYBOARD_PRESET_STORAGE_KEY = 'beike:storyboard_preset';

/** 获取默认预设 */
export function getDefaultStoryboardPreset(): StoryboardPresetConfig {
  return STORYBOARD_PRESETS[0]; // 'single-shot'
}

/** 根据 id 查找预设 */
export function getStoryboardPresetById(id: string): StoryboardPresetConfig | undefined {
  return STORYBOARD_PRESETS.find(p => p.id === id);
}

/** 从 localStorage 恢复预设 */
export function restoreStoredStoryboardPreset(): StoryboardPresetConfig {
  try {
    const stored = domainStorage()?.getItem(STORYBOARD_PRESET_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as StoryboardPresetConfig;
      const found = getStoryboardPresetById(parsed.id);
      if (found) return found;
    }
  } catch {}
  
  return getDefaultStoryboardPreset();
}

/** 保存预设到 localStorage */
export function persistStoryboardPreset(preset: StoryboardPresetConfig): void {
  try {
    domainStorage()?.setItem(STORYBOARD_PRESET_STORAGE_KEY, JSON.stringify(preset));
  } catch {}
}
