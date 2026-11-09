import type { AppBackgroundStyle } from '../backgroundCatalog';
import { particlesSchema } from './particles';
import { raysSchema } from './rays';
import {
  STUDIO_FIELD_GROUPS,
  colorField,
  colorPresets,
  grouped,
  selectField,
  shardsSchema,
  slider,
  switchField,
  type StudioField,
  type StudioFieldGroup,
  type StudioPreset,
  type StudioRenderContext,
  type StudioRenderMode,
  type StudioSchema,
  type StudioValue,
  type StudioValues,
} from './shards';

export type {
  StudioField,
  StudioFieldGroup,
  StudioPreset,
  StudioRenderContext,
  StudioRenderMode,
  StudioSchema,
  StudioValue,
  StudioValues,
};
export { STUDIO_FIELD_GROUPS };

export const beamsSchema: StudioSchema = {
  fields: [
    ...grouped('appearance', [
      colorField('color', '颜色'),
      slider('glow', '辉光', 0, 2, 0.05),
      slider('brightness', '亮度', 0, 3, 0.05),
      slider('grain', '颗粒', 0, 1, 0.01),
      slider('fade', '渐隐', 0, 1, 0.01),
      slider('opacity', '不透明度', 0, 1, 0.01),
    ]),
    ...grouped('layout', [
      slider('beamWidth', '光束宽度', 8, 280, 1),
      slider('waveLength', '波长', 20, 400, 1),
      slider('rotation', '旋转', -180, 180, 1),
    ]),
    ...grouped('motion', [
      slider('speed', '速度', 0, 3, 0.05),
      slider('mouseStrength', '鼠标强度', 0, 2, 0.05),
      switchField('mouseInteraction', '鼠标交互'),
      switchField('intro', '入场动画'),
    ]),
    ...grouped('advanced', [
      slider('depth', '深度', 0, 3, 0.05),
      slider('sharpness', '锐度', 0, 1, 0.01),
      slider('twist', '扭转', 0, 2, 0.05),
      slider('fillLight', '补光', 0, 1.5, 0.05),
      slider('variation', '变化', 0, 1, 0.01),
    ]),
  ],
  defaults: {
    color: '#3b82f6',
    beamWidth: 140,
    rotation: 30,
    speed: 0.25,
    waveLength: 233,
    depth: 1,
    sharpness: 0.6,
    twist: 0,
    fillLight: 0.3,
    glow: 0.6,
    brightness: 1.1,
    variation: 0,
    grain: 0.35,
    mouseStrength: 1,
    fade: 0,
    opacity: 0.85,
    mouseInteraction: true,
    intro: true,
  },
  presets: colorPresets({ accent: 'color' }, {
    amethyst: {
      label: '紫晶奔流',
      values: { beamWidth: 90, speed: 1.1, glow: 1.2, brightness: 1.6, waveLength: 160 },
    },
    glacier: {
      label: '冰川平流',
      values: { beamWidth: 200, speed: 0.15, rotation: 12, glow: 0.35, sharpness: 0.3, waveLength: 320 },
    },
    copper: {
      label: '铜橙锐光',
      values: { beamWidth: 48, sharpness: 0.9, twist: 1.2, brightness: 1.8, speed: 0.6 },
    },
    graphite: {
      label: '石墨细线',
      values: { beamWidth: 18, brightness: 0.55, glow: 0.1, grain: 0.1, opacity: 0.55, mouseInteraction: false },
    },
    halo: {
      label: '光晕漫射',
      values: { beamWidth: 220, glow: 1.6, fillLight: 0.9, variation: 0.45, opacity: 0.75, speed: 0.35 },
    },
  }),
};

export const dotsSchema: StudioSchema = {
  fields: [
    ...grouped('appearance', [
      colorField('baseColor', '基础颜色'),
      colorField('activeColor', '激活颜色'),
      selectField('shape', '形状', [
        { id: 'circle', label: '圆形' },
        { id: 'square', label: '方形' },
      ]),
      slider('glow', '辉光', 0, 2, 0.05),
      slider('fade', '渐隐', 0, 1, 0.01),
      slider('opacity', '不透明度', 0, 1, 0.01),
    ]),
    ...grouped('layout', [
      slider('dotSize', '点大小', 1, 12, 0.5),
      slider('gap', '间距', 8, 48, 1),
    ]),
    ...grouped('motion', [
      slider('proximity', '感应范围', 20, 280, 1),
      slider('strength', '强度', 0, 3, 0.05),
      slider('shockRadius', '冲击半径', 40, 480, 10),
      slider('shockStrength', '冲击强度', 0, 12, 0.1),
      switchField('clickShock', '点击冲击'),
      switchField('mouseInteraction', '鼠标交互'),
      switchField('intro', '入场动画'),
    ]),
    ...grouped('advanced', [
      slider('bounce', '回弹', 0, 1, 0.01),
      slider('tension', '张力', 0, 1, 0.01),
      slider('returnDuration', '复位时长', 0.1, 2, 0.05),
      slider('swell', '膨胀', 0, 2, 0.05),
      slider('stretch', '拉伸', 0, 2, 0.05),
    ]),
  ],
  defaults: {
    baseColor: '#52525b',
    activeColor: '#818cf8',
    shape: 'circle',
    dotSize: 2.5,
    gap: 24,
    proximity: 130,
    strength: 1,
    bounce: 0.6,
    tension: 0.4,
    returnDuration: 0.8,
    shockRadius: 240,
    shockStrength: 4,
    swell: 0.8,
    stretch: 0.5,
    glow: 0.5,
    fade: 0,
    opacity: 0.9,
    clickShock: true,
    mouseInteraction: true,
    intro: true,
  },
  presets: colorPresets({ main: 'baseColor', accent: 'activeColor' }, {
    amethyst: {
      label: '紫晶脉冲',
      values: { dotSize: 3.5, gap: 22, proximity: 170, strength: 1.6, glow: 1.2, shockStrength: 7, swell: 1.3, clickShock: true },
    },
    glacier: {
      label: '冰川微风',
      values: { dotSize: 2, gap: 34, proximity: 200, strength: 0.55, glow: 0.25, bounce: 0.25, shockStrength: 2 },
    },
    copper: {
      label: '铜橙引力',
      values: { dotSize: 2.5, gap: 16, proximity: 240, strength: 2, tension: 0.75, shockRadius: 360 },
    },
    graphite: {
      label: '石墨极简',
      values: { dotSize: 1.5, gap: 30, proximity: 70, strength: 0.25, glow: 0, fade: 0.25, opacity: 0.5, clickShock: false },
    },
    halo: {
      label: '光晕呼吸',
      values: { dotSize: 3, gap: 26, glow: 1.7, swell: 1.5, stretch: 0.9, opacity: 0.8, intro: true },
    },
  }),
};

export const galaxySchema: StudioSchema = {
  fields: [
    ...grouped('appearance', [
      colorField('starColor', '星色'),
      colorField('starColorAlt', '辅色'),
      slider('glowIntensity', '辉光', 0, 1.5, 0.01),
      slider('flareIntensity', '星芒', 0, 2, 0.05),
      slider('opacity', '不透明度', 0, 1, 0.01),
    ]),
    ...grouped('layout', [
      slider('density', '密度', 0.1, 2, 0.05),
      slider('starSize', '星点大小', 0.2, 3, 0.05),
      slider('layers', '层数', 2, 8, 1),
    ]),
    ...grouped('motion', [
      slider('starSpeed', '星速', 0, 2, 0.05),
      slider('speed', '速度', 0, 2, 0.05),
      slider('rotationSpeed', '旋转速度', 0, 1, 0.01),
      selectField('direction', '方向', [
        { id: 'forward', label: '向前' },
        { id: 'backward', label: '向后' },
      ]),
      switchField('mouseInteraction', '鼠标交互'),
      switchField('mouseRepulsion', '鼠标排斥'),
      switchField('clickWarp', '点击跃迁'),
      switchField('intro', '入场动画'),
    ]),
    ...grouped('advanced', [
      slider('hueShift', '色相偏移', 0, 360, 1),
      slider('saturation', '饱和度', 0, 1, 0.01),
      slider('twinkleIntensity', '闪烁', 0, 1, 0.01),
      slider('repulsionStrength', '排斥强度', 0, 8, 0.1),
    ]),
  ],
  defaults: {
    starColor: '#8b5cf6',
    starColorAlt: '#e0e7ff',
    hueShift: 140,
    saturation: 0,
    density: 0.6,
    glowIntensity: 0.55,
    starSize: 1,
    flareIntensity: 1,
    twinkleIntensity: 0.3,
    starSpeed: 0.3,
    speed: 0.35,
    rotationSpeed: 0.1,
    layers: 4,
    direction: 'forward',
    repulsionStrength: 2,
    opacity: 0.95,
    mouseInteraction: true,
    mouseRepulsion: true,
    clickWarp: true,
    intro: true,
  },
  presets: colorPresets({ accent: 'starColor', main: 'starColorAlt' }, {
    amethyst: {
      label: '紫晶旋涡',
      values: { density: 1.1, rotationSpeed: 0.45, speed: 0.7, glowIntensity: 0.9, layers: 6 },
    },
    glacier: {
      label: '冰川星河',
      values: { density: 0.8, starSpeed: 0.15, speed: 0.2, twinkleIntensity: 0.15, direction: 'forward' },
    },
    copper: {
      label: '铜橙星暴',
      values: { density: 1.5, starSize: 1.6, flareIntensity: 1.6, speed: 1.1, clickWarp: true },
    },
    graphite: {
      label: '石墨远星',
      values: { density: 0.25, starSize: 0.45, glowIntensity: 0.15, opacity: 0.55, mouseRepulsion: false, speed: 0.1 },
    },
    halo: {
      label: '光晕星云',
      values: { glowIntensity: 1.3, flareIntensity: 1.5, twinkleIntensity: 0.7, saturation: 0.45, opacity: 0.85 },
    },
  }),
};

export type DynamicBackgroundStyle = Exclude<AppBackgroundStyle, 'clean'>;

export type BackgroundStudios = Record<DynamicBackgroundStyle, StudioValues>;

const SCHEMAS: Record<DynamicBackgroundStyle, StudioSchema> = {
  shards: shardsSchema,
  beams: beamsSchema,
  rays: raysSchema,
  dots: dotsSchema,
  galaxy: galaxySchema,
  particles: particlesSchema,
};

const ACCENT_KEY: Record<DynamicBackgroundStyle, string> = {
  shards: 'accentColor',
  beams: 'color',
  rays: 'raysColor',
  dots: 'activeColor',
  galaxy: 'starColor',
  particles: 'color',
};

export const STUDIO_STYLES: DynamicBackgroundStyle[] = ['shards', 'beams', 'rays', 'dots', 'galaxy', 'particles'];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isDynamicStyle(style: AppBackgroundStyle): style is DynamicBackgroundStyle {
  return style !== 'clean';
}

export function getStudioSchema(style: AppBackgroundStyle): StudioSchema | null {
  return isDynamicStyle(style) ? SCHEMAS[style] : null;
}

export function defaultStudio(style: DynamicBackgroundStyle): StudioValues {
  return { ...SCHEMAS[style].defaults };
}

export function defaultStudios(): BackgroundStudios {
  return {
    shards: defaultStudio('shards'),
    beams: defaultStudio('beams'),
    rays: defaultStudio('rays'),
    dots: defaultStudio('dots'),
    galaxy: defaultStudio('galaxy'),
    particles: defaultStudio('particles'),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeStudio(style: DynamicBackgroundStyle, raw: unknown): StudioValues {
  const schema = SCHEMAS[style];
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const next: StudioValues = { ...schema.defaults };
  for (const field of schema.fields) {
    const value = source[field.key];
    if (field.type === 'slider') {
      if (typeof value !== 'number' || Number.isNaN(value)) continue;
      const clamped = clamp(value, field.min, field.max);
      next[field.key] = field.step >= 1 ? Math.round(clamped) : clamped;
      continue;
    }
    if (field.type === 'color') {
      if (typeof value === 'string' && HEX_COLOR.test(value)) next[field.key] = value.toLowerCase();
      continue;
    }
    if (field.type === 'select') {
      if (typeof value === 'string' && field.options.some((option) => option.id === value)) next[field.key] = value;
      continue;
    }
    if (typeof value === 'boolean') next[field.key] = value;
  }
  return next;
}

export function normalizeStudios(raw: unknown): BackgroundStudios {
  const next = defaultStudios();
  if (!raw || typeof raw !== 'object') return next;
  const source = raw as Record<string, unknown>;
  for (const style of STUDIO_STYLES) {
    if (source[style] && typeof source[style] === 'object') {
      next[style] = normalizeStudio(style, source[style]);
    }
  }
  return next;
}

export function migrateLegacyStudios(input: {
  legacyShard: unknown;
  legacyTune: unknown;
  activeStyle: AppBackgroundStyle;
}): BackgroundStudios {
  const studios = defaultStudios();
  if (input.legacyShard && typeof input.legacyShard === 'object') {
    studios.shards = normalizeStudio('shards', input.legacyShard);
  }
  const tune = input.legacyTune && typeof input.legacyTune === 'object'
    ? input.legacyTune as { accent?: unknown }
    : null;
  const accent = tune && typeof tune.accent === 'string' && HEX_COLOR.test(tune.accent)
    ? tune.accent.toLowerCase()
    : null;
  if (accent && isDynamicStyle(input.activeStyle) && input.activeStyle !== 'shards') {
    const key = ACCENT_KEY[input.activeStyle];
    studios[input.activeStyle] = normalizeStudio(input.activeStyle, {
      ...studios[input.activeStyle],
      [key]: accent,
    });
  }
  return studios;
}

export function studioAccent(style: AppBackgroundStyle, values: StudioValues | undefined): string | null {
  if (!values || !isDynamicStyle(style)) return null;
  const accent = values[ACCENT_KEY[style]];
  return typeof accent === 'string' ? accent : null;
}

export function studioValueEquals(left: StudioValue | undefined, right: StudioValue | undefined) {
  if (typeof left === 'string' && typeof right === 'string') return left.toLowerCase() === right.toLowerCase();
  if (typeof left === 'number' && typeof right === 'number') return Math.abs(left - right) < 1e-6;
  return left === right;
}

export function matchingPresetId(style: AppBackgroundStyle, values: StudioValues): string | null {
  const schema = getStudioSchema(style);
  if (!schema) return null;
  const match = schema.presets.find((preset) => Object.entries(preset.values).every(([key, value]) => (
    studioValueEquals(value, values[key])
  )));
  return match?.id ?? null;
}

export function countStudioChanges(style: AppBackgroundStyle, values: StudioValues) {
  const schema = getStudioSchema(style);
  if (!schema) return 0;
  return schema.fields.filter((field) => !studioValueEquals(values[field.key], schema.defaults[field.key])).length;
}

export function snapStudioNumber(value: number, min: number, max: number, step: number) {
  const safeStep = step > 0 ? step : 1;
  const clamped = clamp(value, min, max);
  const snapped = min + Math.round((clamped - min) / safeStep) * safeStep;
  const bounded = clamp(snapped, min, max);
  if (safeStep >= 1) return Math.round(bounded);
  const digits = safeStep >= 0.1 ? 1 : 2;
  return Number(bounded.toFixed(digits));
}
