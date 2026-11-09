export type StudioValue = number | string | boolean;

export type StudioValues = Record<string, StudioValue>;

export type StudioFieldGroup = 'appearance' | 'layout' | 'motion' | 'advanced';

type SliderField = { key: string; label: string; type: 'slider'; min: number; max: number; step: number };
type ColorField = { key: string; label: string; type: 'color' };
type SelectField = { key: string; label: string; type: 'select'; options: Array<{ id: string; label: string }> };
type SwitchField = { key: string; label: string; type: 'switch' };

export type UngroupedStudioField = SliderField | ColorField | SelectField | SwitchField;

export type StudioField = UngroupedStudioField & { group: StudioFieldGroup };

export type StudioPreset = {
  id: string;
  label: string;
  mainColor: string;
  accentColor: string;
  values: StudioValues;
};

export type StudioSchema = {
  fields: StudioField[];
  defaults: StudioValues;
  presets: StudioPreset[];
};

export type StudioRenderMode = 'live' | 'stage' | 'thumb';

export type StudioRenderContext = {
  isDark: boolean;
  mode: StudioRenderMode;
};

export const STUDIO_FIELD_GROUPS: Array<{ id: StudioFieldGroup; label: string; collapsible: boolean }> = [
  { id: 'appearance', label: '外观与色彩', collapsible: false },
  { id: 'layout', label: '布局与尺寸', collapsible: false },
  { id: 'motion', label: '交互与动效', collapsible: false },
  { id: 'advanced', label: '高阶微调', collapsible: true },
];

export function slider(key: string, label: string, min: number, max: number, step: number): SliderField {
  return { key, label, type: 'slider', min, max, step };
}

export function colorField(key: string, label: string): ColorField {
  return { key, label, type: 'color' };
}

export function selectField(
  key: string,
  label: string,
  options: Array<{ id: string; label: string }>,
): SelectField {
  return { key, label, type: 'select', options };
}

export function switchField(key: string, label: string): SwitchField {
  return { key, label, type: 'switch' };
}

export function grouped(group: StudioFieldGroup, fields: UngroupedStudioField[]): StudioField[] {
  return fields.map((field) => ({ ...field, group }));
}

const PALETTE = [
  { id: 'amethyst', label: '紫晶', main: '#7c3aed', accent: '#a855f7' },
  { id: 'glacier', label: '冰川', main: '#0284c7', accent: '#38bdf8' },
  { id: 'copper', label: '铜橙', main: '#ea580c', accent: '#f59e0b' },
  { id: 'graphite', label: '石墨', main: '#475569', accent: '#94a3b8' },
  { id: 'halo', label: '光晕', main: '#6366f1', accent: '#c4b5fd' },
] as const;

export type PaletteId = (typeof PALETTE)[number]['id'];

export type PresetStyle = {
  label?: string;
  values?: StudioValues;
};

export function colorPresets(
  keys: { main?: string; accent?: string },
  styles?: Partial<Record<PaletteId, PresetStyle>>,
): StudioPreset[] {
  return PALETTE.map((item) => {
    const style = styles?.[item.id];
    const values: StudioValues = { ...(style?.values ?? {}) };
    if (keys.main) values[keys.main] = item.main;
    if (keys.accent) values[keys.accent] = item.accent;
    return {
      id: item.id,
      label: style?.label ?? item.label,
      mainColor: item.main,
      accentColor: item.accent,
      values,
    };
  });
}

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
