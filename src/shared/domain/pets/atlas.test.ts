import { describe, expect, it } from 'vitest';
import { parsePetCommands, petFrame, pointerLookIndex, resolvePetPose } from './atlas';

describe('codex pet atlas frames', () => {
  it('uses only the populated frames and their real durations', () => {
    expect(petFrame('idle', 2, 0, null)).toEqual({ row: 0, column: 0 });
    expect(petFrame('idle', 2, 280, null)).toEqual({ row: 0, column: 1 });
    expect(petFrame('idle', 2, 279, null)).toEqual({ row: 0, column: 0 });
    expect(petFrame('working', 2, 120 * 5, null)).toEqual({ row: 7, column: 5 });
    expect(petFrame('success', 1, 140 * 4, null)).toEqual({ row: 4, column: 4 });
    expect(petFrame('failed', 2, 140 * 7, null)).toEqual({ row: 5, column: 7 });
  });

  it('maps sixteen clockwise directions and keeps the pointer deadzone on idle', () => {
    expect(pointerLookIndex(0, -100, 72)).toBe(0);
    expect(pointerLookIndex(100, 0, 72)).toBe(4);
    expect(pointerLookIndex(0, 100, 72)).toBe(8);
    expect(pointerLookIndex(-100, 0, 72)).toBe(12);
    expect(pointerLookIndex(12, 8, 72)).toBeNull();
    expect(petFrame('look', 2, 0, 4)).toEqual({ row: 9, column: 4 });
    expect(petFrame('look', 2, 0, 12)).toEqual({ row: 10, column: 4 });
    expect(petFrame('look', 1, 0, 4)).toEqual({ row: 0, column: 0 });
    expect(petFrame('look', 2, 0, null)).toEqual({ row: 0, column: 0 });
  });
});

describe('pet pose priority', () => {
  it('lets the settings preview and cover feeding override global work', () => {
    expect(resolvePetPose({ preview: 'look', feedPhase: 'analyzing', busy: true })).toBe('look');
    expect(resolvePetPose({ feedPhase: 'uploading', flash: 'success', busy: true })).toBe('working');
    expect(resolvePetPose({ feedPhase: 'error', busy: true })).toBe('failed');
    expect(resolvePetPose({ feedPhase: 'idle', flash: 'success', busy: true })).toBe('success');
    expect(resolvePetPose({ feedPhase: 'ready', busy: true })).toBe('working');
    expect(resolvePetPose({})).toBe('idle');
  });
});

describe('codex pet import commands', () => {
  it('reads one or more add commands and ignores blank lines', () => {
    expect(parsePetCommands('  npx codex-pets add q-ban-da-fei-yu \r\n\nnpx   codex-pets   add   pet-6ac83c93535081918861d5c78bb9a8fc')).toEqual([
      { input: 'npx codex-pets add q-ban-da-fei-yu', id: 'q-ban-da-fei-yu' },
      { input: 'npx   codex-pets   add   pet-6ac83c93535081918861d5c78bb9a8fc', id: 'pet-6ac83c93535081918861d5c78bb9a8fc' },
    ]);
  });

  it('rejects shell syntax, other commands and arbitrary addresses', () => {
    const parsed = parsePetCommands([
      'npx codex-pets add tiny-dino && rm -rf /',
      'npx codex-pets add-collection cats',
      'npx codex-pets add https://evil.example/pet',
      'curl https://codex-pets.net/tiny-dino',
    ].join('\n'));
    expect(parsed.every((item) => item.error && !item.id)).toBe(true);
  });
});
