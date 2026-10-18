import { describe, expect, it } from 'vitest';
import { normalizeCustomPresets } from './customPresets';
import {
  countStudioChanges,
  defaultStudio,
  getStudioSchema,
  migrateLegacyStudios,
  normalizeStudio,
  normalizeStudios,
  snapStudioNumber,
  STUDIO_STYLES,
} from './index';
import { STUDIO_FIELD_GROUPS } from './types';

describe('background studio schema', () => {
  it('gives every field a default and keeps presets inside the schema', () => {
    for (const style of STUDIO_STYLES) {
      const schema = getStudioSchema(style);
      expect(schema).not.toBeNull();
      for (const field of schema!.fields) {
        expect(schema!.defaults).toHaveProperty(field.key);
      }
      for (const preset of schema!.presets) {
        for (const key of Object.keys(preset.values)) {
          expect(schema!.fields.some((field) => field.key === key)).toBe(true);
        }
      }
    }
  });

  it('clamps numbers and falls back when a value is invalid', () => {
    const studio = normalizeStudio('shards', {
      count: 99999,
      placement: 'diagonal',
      shardColor: 'purple',
      intro: 'yes',
      speed: 1.25,
    });
    expect(studio.count).toBe(3000);
    expect(studio.placement).toBe(defaultStudio('shards').placement);
    expect(studio.shardColor).toBe(defaultStudio('shards').shardColor);
    expect(studio.intro).toBe(true);
    expect(studio.speed).toBe(1.25);
  });

  it('rounds integer sliders and lowercases colors', () => {
    const studio = normalizeStudio('dots', { gap: 18.4, activeColor: '#AABBCC' });
    expect(studio.gap).toBe(18);
    expect(studio.activeColor).toBe('#aabbcc');
  });

  it('migrates the legacy shard studio and the active style accent', () => {
    const studios = migrateLegacyStudios({
      legacyShard: { count: 800, shardColor: '#112233', accentColor: '#445566', placement: 'left' },
      legacyTune: { accent: '#abcdef', density: 10, speed: 10 },
      activeStyle: 'beams',
    });
    expect(studios.shards.count).toBe(800);
    expect(studios.shards.shardColor).toBe('#112233');
    expect(studios.shards.accentColor).toBe('#445566');
    expect(studios.shards.placement).toBe('left');
    expect(studios.beams.color).toBe('#abcdef');
    expect(studios.dots.activeColor).toBe(defaultStudio('dots').activeColor);
  });

  it('keeps shard colors when the legacy accent belonged to another control', () => {
    const studios = migrateLegacyStudios({
      legacyShard: { accentColor: '#445566' },
      legacyTune: { accent: '#abcdef' },
      activeStyle: 'shards',
    });
    expect(studios.shards.accentColor).toBe('#445566');
  });

  it('fills missing styles when reading a partial store', () => {
    const studios = normalizeStudios({ galaxy: { density: 1.4, direction: 'backward' } });
    expect(studios.galaxy.density).toBe(1.4);
    expect(studios.galaxy.direction).toBe('backward');
    expect(studios.particles.particleCount).toBe(defaultStudio('particles').particleCount);
  });

  it('assigns every field to a known group and gives every group at least one field', () => {
    const groups = new Set(STUDIO_FIELD_GROUPS.map((group) => group.id));
    for (const style of STUDIO_STYLES) {
      const schema = getStudioSchema(style);
      const seen = new Set<string>();
      for (const field of schema!.fields) {
        expect(groups.has(field.group)).toBe(true);
        seen.add(field.group);
      }
      expect(seen.size).toBe(groups.size);
    }
  });

  it('keeps preset motion values and treats a single field reset as the default', () => {
    for (const style of STUDIO_STYLES) {
      const schema = getStudioSchema(style)!;
      for (const preset of schema.presets) {
        const normalized = normalizeStudio(style, { ...schema.defaults, ...preset.values });
        const motionKeys = Object.keys(preset.values).filter((key) => (
          schema.fields.find((field) => field.key === key)?.type !== 'color'
        ));
        expect(motionKeys.length).toBeGreaterThan(0);
        for (const key of motionKeys) {
          expect(normalized[key]).toBe(preset.values[key]);
        }
      }
    }
    const changed = { ...defaultStudio('dots'), strength: 2.5 };
    expect(countStudioChanges('dots', changed)).toBe(1);
    expect(countStudioChanges('dots', { ...changed, strength: defaultStudio('dots').strength })).toBe(0);
  });

  it('snaps slider input onto the field step and range', () => {
    expect(snapStudioNumber(18.4, 8, 48, 1)).toBe(18);
    expect(snapStudioNumber(99, 0, 1, 0.01)).toBe(1);
    expect(snapStudioNumber(0.33, 0, 1, 0.05)).toBe(0.35);
    expect(snapStudioNumber(-4, 0.1, 2, 0.05)).toBe(0.1);
  });

  it('normalizes saved custom presets and drops invalid entries', () => {
    const parsed = normalizeCustomPresets({
      dots: [
        { id: 'a', label: '  我的脉冲  ', values: { gap: 999, activeColor: '#ABCDEF', clickShock: false } },
        { id: '', label: 'skip' },
        'nope',
      ],
      beams: [{ label: 'missing id', values: { speed: 1 } }],
    });
    expect(parsed.dots).toHaveLength(1);
    expect(parsed.dots[0].label).toBe('我的脉冲');
    expect(parsed.dots[0].values.gap).toBe(48);
    expect(parsed.dots[0].values.activeColor).toBe('#abcdef');
    expect(parsed.dots[0].values.clickShock).toBe(false);
    expect(parsed.beams).toEqual([]);
    expect(parsed.galaxy).toEqual([]);
    expect(normalizeCustomPresets(null).particles).toEqual([]);
  });
});
