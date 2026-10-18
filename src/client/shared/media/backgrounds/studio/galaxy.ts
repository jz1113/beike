import { colorPresets } from './palette';
import { colorField, grouped, selectField, slider, switchField, type StudioSchema } from './types';

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
