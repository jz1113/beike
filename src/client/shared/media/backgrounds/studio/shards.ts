import { colorPresets } from './palette';
import { colorField, grouped, selectField, slider, switchField, type StudioSchema } from './types';

export const shardsSchema: StudioSchema = {
  fields: [
    ...grouped('appearance', [
      colorField('shardColor', '碎片颜色'),
      colorField('accentColor', '强调色'),
      selectField('material', '材质', [
        { id: 'glass', label: '玻璃' },
        { id: 'chrome', label: '金属' },
      ]),
      selectField('markers', '标记', [
        { id: 'plus', label: '十字' },
        { id: 'dots', label: '圆点' },
        { id: 'none', label: '无' },
      ]),
      selectField('appearance', '浅色模式', [
        { id: 'auto', label: '跟随主题' },
        { id: 'light', label: '浅色' },
        { id: 'dark', label: '深色' },
      ]),
      slider('glow', '辉光', 0, 1.5, 0.01),
      slider('vignette', '暗角', 0, 1, 0.01),
    ]),
    ...grouped('layout', [
      selectField('placement', '放置', [
        { id: 'full', label: '全幅' },
        { id: 'center', label: '居中' },
        { id: 'left', label: '左侧' },
        { id: 'right', label: '右侧' },
      ]),
      slider('count', '数量', 100, 3000, 50),
      slider('shardSize', '碎片尺寸', 0.2, 3, 0.05),
      slider('spread', '扩散', 0, 3, 0.05),
      slider('scale', '规模', 0.4, 2.5, 0.05),
    ]),
    ...grouped('motion', [
      slider('speed', '速度', 0, 3, 0.05),
      slider('cursorStrength', '光标强度', 0, 1, 0.01),
      slider('parallax', '视差', 0, 1, 0.01),
      switchField('cursor', '跟随光标'),
      switchField('pulseOnClick', '点击脉冲'),
      switchField('holdToGather', '按住聚集'),
      switchField('intro', '入场动画'),
    ]),
    ...grouped('advanced', [
      slider('twist', '扭转', 0, 3, 0.05),
      slider('billow', '巨浪', 0, 3, 0.05),
      slider('depthOfField', '景深', 0, 1, 0.01),
      slider('grain', '颗粒', 0, 0.4, 0.01),
    ]),
  ],
  defaults: {
    shardColor: '#896abd',
    accentColor: '#a855f7',
    placement: 'full',
    material: 'glass',
    markers: 'plus',
    appearance: 'auto',
    count: 1300,
    shardSize: 1,
    spread: 1,
    twist: 1,
    billow: 1,
    speed: 1,
    scale: 1,
    depthOfField: 0.75,
    glow: 0.35,
    grain: 0.06,
    vignette: 0.3,
    cursorStrength: 0.6,
    parallax: 0.5,
    intro: true,
    cursor: true,
    pulseOnClick: false,
    holdToGather: false,
  },
  presets: colorPresets({ main: 'shardColor', accent: 'accentColor' }, {
    amethyst: {
      label: '紫晶气旋',
      values: { count: 1800, speed: 1.6, twist: 1.8, spread: 1.4, glow: 0.7 },
    },
    glacier: {
      label: '冰川薄片',
      values: { material: 'glass', shardSize: 0.6, count: 900, speed: 0.45, glow: 0.2 },
    },
    copper: {
      label: '铜橙聚集',
      values: { material: 'chrome', placement: 'center', holdToGather: true, count: 1100, scale: 1.3 },
    },
    graphite: {
      label: '石墨静置',
      values: { speed: 0.15, glow: 0.05, markers: 'none', cursor: false, count: 600, grain: 0.02 },
    },
    halo: {
      label: '光晕晶簇',
      values: { glow: 1.1, vignette: 0.55, count: 1500, billow: 1.6, pulseOnClick: true },
    },
  }),
};
