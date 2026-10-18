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
