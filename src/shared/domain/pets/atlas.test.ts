import { describe, expect, it } from 'vitest';
import { petFrame, pointerLookIndex } from './atlas';

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
