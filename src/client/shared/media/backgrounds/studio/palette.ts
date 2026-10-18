import type { StudioPreset, StudioValues } from './types';

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
