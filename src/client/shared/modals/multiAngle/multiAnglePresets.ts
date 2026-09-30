export interface MultiAngleSource {
  imageUrl?: string;
  title?: string;
}

export type MultiAnglePresetKey =
  | 'custom'
  | 'fisheye'
  | 'tilted'
  | 'front-high'
  | 'front-low'
  | 'pano-high'
  | 'back';

export type ShotScale = '全景' | '中景' | '特写';

export interface MultiAngleParams {
  preset: MultiAnglePresetKey;
  azimuth: number; // 水平环绕 0° ~ 360°
  elevation: number; // 垂直俯仰 -90° ~ 90° (0° 为中点)
  shotScale: ShotScale; // 全景 | 中景 | 特写
  promptEnabled: boolean; // 提示词开关
  prompt: string; // 提示词文本
  model?: string;
  quality?: string;
  aspectRatio?: string;
}

// 7 大视角预设定义（严格对齐用户提供的真实运行截图）
export interface PresetConfig {
  key: MultiAnglePresetKey;
  label: string;
  azimuth: number;
  elevation: number;
  shotScale: ShotScale;
  promptEnabled: boolean;
  prompt: string;
}

export const PRESET_CONFIGS: PresetConfig[] = [
  {
    key: 'custom',
    label: '自定义',
    azimuth: 0,
    elevation: 0,
    shotScale: '中景',
    promptEnabled: false,
    prompt: '',
  },
  {
    key: 'fisheye',
    label: '鱼眼视角',
    azimuth: 0,
    elevation: 30,
    shotScale: '特写',
    promptEnabled: true,
    prompt: '极度特写镜头，广角镜头，边缘带有鱼眼畸变效果',
  },
  {
    key: 'tilted',
    label: '倾斜视角',
    azimuth: 45,
    elevation: -30,
    shotScale: '中景',
    promptEnabled: true,
    prompt: 'dutch angle，tilted frame',
  },
  {
    key: 'front-high',
    label: '正面俯拍',
    azimuth: 0,
    elevation: 60,
    shotScale: '中景',
    promptEnabled: false,
    prompt: '',
  },
  {
    key: 'front-low',
    label: '正面仰拍',
    azimuth: 0,
    elevation: -30,
    shotScale: '中景',
    promptEnabled: false,
    prompt: '',
  },
  {
    key: 'pano-high',
    label: '全景俯拍',
    azimuth: 45,
    elevation: 30,
    shotScale: '全景',
    promptEnabled: false,
    prompt: '',
  },
  {
    key: 'back',
    label: '背面视角',
    azimuth: 180,
    elevation: 0,
    shotScale: '中景',
    promptEnabled: false,
    prompt: '',
  },
];

export const DEFAULT_MULTI_ANGLE_PARAMS: MultiAngleParams = {
  preset: 'custom',
  azimuth: 0,
  elevation: 0,
  shotScale: '中景',
  promptEnabled: false,
  prompt: '',
};

