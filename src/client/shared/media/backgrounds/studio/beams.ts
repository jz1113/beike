import { colorPresets } from './palette';
import { colorField, grouped, slider, switchField, type StudioSchema } from './types';

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
