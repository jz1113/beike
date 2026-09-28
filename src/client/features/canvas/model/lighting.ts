export type MainLightDirection = 'left' | 'top' | 'right' | 'front' | 'bottom' | 'back';

export interface LightingParams {
  viewMode: 'perspective' | 'front';
  smartMode: boolean;
  brightness: number; // 0 - 100
  color: string; // 'original' | hex
  mainLight: MainLightDirection;
  rimLight: boolean;
  lightCoords: { x: number; y: number }; // normalized 0 - 100
  model?: string;
  quality?: string;
  aspectRatio?: string;
}

// 分视图的光源预设坐标 (透视视角 vs 正面视角)
export const LIGHT_DIRECTION_COORDS_BY_VIEW: Record<'perspective' | 'front', Record<MainLightDirection, { x: number; y: number }>> = {
  perspective: {
    left: { x: 14, y: 50 },
    top: { x: 50, y: 15 },
    right: { x: 86, y: 50 },
    front: { x: 22, y: 70 }, // 透视视角下偏左前侧
    bottom: { x: 50, y: 86 },
    back: { x: 74, y: 32 },
  },
  front: {
    left: { x: 14, y: 50 },
    top: { x: 50, y: 14 },
    right: { x: 86, y: 50 },
    front: { x: 50, y: 64 }, // 正面视角下落在卡片正中下部（如截图所示）
    bottom: { x: 50, y: 86 },
    back: { x: 50, y: 38 },
  },
};

export const DEFAULT_LIGHTING_PARAMS: LightingParams = {
  viewMode: 'perspective',
  smartMode: false,
  brightness: 50,
  color: 'original',
  mainLight: 'front',
  rimLight: false,
  lightCoords: { x: 22, y: 70 }, // 默认透视视角的前方位置
};

// 兼容向后导出的单层预设坐标（使用透视模式）
export const LIGHT_DIRECTION_COORDS = LIGHT_DIRECTION_COORDS_BY_VIEW.perspective;

// 常用推荐光色预设
export const PRESET_LIGHT_COLORS = [
  { name: '原色白光', value: 'original', color: '#ffffff' },
  { name: '暖阳暖光', value: '#ffd199', color: '#ffd199' },
  { name: '黄昏晚霞', value: '#ff884d', color: '#ff884d' },
  { name: '冷调月光', value: '#99d6ff', color: '#99d6ff' },
  { name: '赛博霓虹', value: '#d966ff', color: '#d966ff' },
  { name: '清新青翠', value: '#70e0a5', color: '#70e0a5' },
];
