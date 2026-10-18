import { STUDIO_STYLES, normalizeStudio, type DynamicBackgroundStyle } from './index';
import type { StudioValues } from './types';

export type CustomStudioPreset = {
  id: string;
  label: string;
  values: StudioValues;
};

export type CustomStudioPresetMap = Record<DynamicBackgroundStyle, CustomStudioPreset[]>;

export const CUSTOM_PRESET_LIMIT = 8;
const MAX_LABEL = 16;

export function emptyCustomPresets(): CustomStudioPresetMap {
  return {
    shards: [],
    beams: [],
    rays: [],
    dots: [],
    galaxy: [],
    particles: [],
  };
}

export function normalizeCustomPresets(raw: unknown): CustomStudioPresetMap {
  const next = emptyCustomPresets();
  if (!raw || typeof raw !== 'object') return next;
  const source = raw as Record<string, unknown>;
  for (const style of STUDIO_STYLES) {
    const list = source[style];
    if (!Array.isArray(list)) continue;
    next[style] = list.flatMap((item) => parseCustomPreset(style, item)).slice(0, CUSTOM_PRESET_LIMIT);
  }
  return next;
}

export function createCustomPreset(
  style: DynamicBackgroundStyle,
  label: string,
  values: StudioValues,
  id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
): CustomStudioPreset {
  return {
    id,
    label: cleanLabel(label),
    values: normalizeStudio(style, values),
  };
}

function parseCustomPreset(style: DynamicBackgroundStyle, item: unknown): CustomStudioPreset[] {
  if (!item || typeof item !== 'object') return [];
  const record = item as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.trim() === '') return [];
  return [{
    id: record.id,
    label: cleanLabel(typeof record.label === 'string' ? record.label : ''),
    values: normalizeStudio(style, record.values),
  }];
}

function cleanLabel(label: string) {
  const trimmed = label.trim().slice(0, MAX_LABEL);
  return trimmed || '自定义';
}
