import { colorPresets } from './palette';
import { colorField, grouped, selectField, slider, switchField, type StudioSchema } from './types';

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
