import { colorPresets } from './palette';
import { colorField, grouped, selectField, slider, switchField, type StudioSchema } from './types';

export const raysSchema: StudioSchema = {
  fields: [
    ...grouped('appearance', [
      colorField('raysColor', '光线颜色'),
      slider('glow', '辉光', 0, 2, 0.01),
      slider('saturation', '饱和度', 0, 2, 0.01),
      slider('intensity', '强度', 0, 2, 0.01),
      slider('opacity', '不透明度', 0, 1, 0.01),
    ]),
    ...grouped('layout', [
      selectField('raysOrigin', '光源位置', [
        { id: 'top-center', label: '顶部居中' },
        { id: 'top-left', label: '左上' },
        { id: 'top-right', label: '右上' },
        { id: 'left', label: '左侧' },
        { id: 'right', label: '右侧' },
        { id: 'bottom-center', label: '底部居中' },
        { id: 'bottom-left', label: '左下' },
        { id: 'bottom-right', label: '右下' },
      ]),
      slider('lightSpread', '扩散', 0.05, 2, 0.01),
      slider('rayLength', '光线长度', 0.2, 6, 0.05),
      slider('rayDensity', '光线密度', 0.1, 3, 0.05),
    ]),
    ...grouped('motion', [
      slider('raysSpeed', '速度', 0, 3, 0.05),
      slider('mouseInfluence', '鼠标影响', 0, 1, 0.01),
      switchField('pulsating', '脉动'),
      switchField('followMouse', '跟随鼠标'),
      switchField('cursorShadow', '光标阴影'),
      switchField('clickPulse', '点击脉冲'),
      switchField('intro', '入场动画'),
    ]),
    ...grouped('advanced', [
      slider('tilt', '倾斜', -1, 1, 0.01),
      slider('raySharpness', '锐度', 0, 1, 0.01),
      slider('haze', '雾气', 0, 1, 0.01),
      slider('atmosphere', '大气感', 0, 2, 0.01),
      slider('fadeDistance', '衰减距离', 0, 2, 0.01),
      slider('noiseAmount', '噪点', 0, 1, 0.01),
      slider('distortion', '扭曲', 0, 1, 0.01),
    ]),
  ],
  defaults: {
    raysOrigin: 'top-center',
    raysColor: '#60a5fa',
    raysSpeed: 0.5,
    lightSpread: 0.46,
    rayLength: 2.1,
    rayDensity: 1,
    tilt: 0,
    raySharpness: 0.35,
    glow: 0.6,
    haze: 0.25,
    atmosphere: 1,
    intensity: 1,
    fadeDistance: 1,
    saturation: 1,
    mouseInfluence: 0.12,
    noiseAmount: 0,
    distortion: 0,
    opacity: 0.9,
    pulsating: false,
    followMouse: true,
    cursorShadow: true,
    clickPulse: true,
    intro: true,
  },
  presets: colorPresets({ accent: 'raysColor' }, {
    amethyst: {
      label: '紫晶放射',
      values: { raysOrigin: 'top-center', rayLength: 3.4, rayDensity: 1.6, glow: 1.1, intensity: 1.4, raysSpeed: 0.8 },
    },
    glacier: {
      label: '冰川天光',
      values: { raysOrigin: 'top-left', lightSpread: 1.1, rayLength: 4.2, haze: 0.45, raysSpeed: 0.2, glow: 0.4 },
    },
    copper: {
      label: '铜橙斜晖',
      values: { raysOrigin: 'bottom-right', tilt: 0.45, raySharpness: 0.75, intensity: 1.5, saturation: 1.4 },
    },
    graphite: {
      label: '石墨静光',
      values: { raysSpeed: 0.05, glow: 0.15, intensity: 0.45, opacity: 0.45, pulsating: false, clickPulse: false },
    },
    halo: {
      label: '光晕脉动',
      values: { glow: 1.6, pulsating: true, lightSpread: 0.9, atmosphere: 1.5, raysSpeed: 0.7, opacity: 0.8 },
    },
  }),
};
