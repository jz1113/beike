import type { AppBackgroundStyle } from '../backgroundCatalog';
import { beamsSchema } from './beams';
import { dotsSchema } from './dots';
import { galaxySchema } from './galaxy';
import { particlesSchema } from './particles';
import { raysSchema } from './rays';
import { shardsSchema } from './shards';
import type { StudioSchema, StudioValue, StudioValues } from './types';

export type { StudioField, StudioFieldGroup, StudioPreset, StudioRenderContext, StudioRenderMode, StudioSchema, StudioValue, StudioValues } from './types';
export { STUDIO_FIELD_GROUPS } from './types';

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
