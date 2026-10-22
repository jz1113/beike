import { describe, expect, it, vi } from 'vitest';
import { clampPetPosition, LEGACY_PET_POSITION_KEY, PET_POSITION_KEY, petPanelLayout, petStackLayout, readPetPosition, writePetPosition } from './petGeometry';

const bounds = { width: 1000, height: 740, left: 16, right: 16, top: 16, bottom: 16 };
const size = { width: 160, height: 140 };

describe('pet position rules', () => {
  it('defaults to the lower right and respects every safe edge', () => {
    expect(clampPetPosition({ x: Infinity, y: NaN }, size, bounds)).toEqual({ x: 824, y: 584 });
    expect(clampPetPosition({ x: -100, y: -100 }, size, bounds)).toEqual({ x: 16, y: 16 });
    expect(clampPetPosition({ x: 9999, y: 9999 }, size, { ...bounds, right: 40, bottom: 50 })).toEqual({ x: 800, y: 550 });
  });
  it('corrects restored coordinates after shrinking and keeps valid coordinates unchanged', () => {
    expect(clampPetPosition({ x: 800, y: 580 }, size, { ...bounds, width: 400, height: 500 })).toEqual({ x: 224, y: 344 });
    expect(clampPetPosition({ x: 100, y: 100 }, size, bounds)).toEqual({ x: 100, y: 100 });
    expect(clampPetPosition({ x: 800, y: 580 }, size, { ...bounds, width: 100, height: 100 })).toEqual({ x: 16, y: 16 });
  });
  it.each(['null', '{}', '[]', 'bad', '{"x":"2","y":3}', '{"x":null,"y":0}', '{"x":1e999,"y":0}'])('rejects malformed saved data: %s', (value) => {
    expect(readPetPosition({ getItem: () => value })).toBeNull();
  });
  it('reads only numeric coordinates and tolerates blocked reads and writes', () => {
    const getItem = vi.fn(() => '{"x":25,"y":30,"extra":true}');
    expect(readPetPosition({ getItem })).toEqual({ x: 25, y: 30 });
    expect(getItem).toHaveBeenCalledWith(PET_POSITION_KEY);
    const legacy = vi.fn((key: string) => key === LEGACY_PET_POSITION_KEY ? '{"x":8,"y":9}' : null);
    expect(readPetPosition({ getItem: legacy })).toEqual({ x: 8, y: 9 });
    expect(readPetPosition({ getItem: () => { throw Error('blocked'); } })).toBeNull();
    const setItem = vi.fn();
    writePetPosition({ setItem }, { x: 25, y: 30 });
    expect(setItem).toHaveBeenCalledWith(PET_POSITION_KEY, '{"x":25,"y":30}');
    expect(() => writePetPosition({ setItem: () => { throw Error('blocked'); } }, { x: 0, y: 0 })).not.toThrow();
  });
  it('opens above a lower pet and below an upper pet without crossing either horizontal edge', () => {
    expect(petPanelLayout({ x: 824, y: 584 }, size, bounds, 300)).toEqual({ left: 604, top: 272, width: 380, maxHeight: 556, side: 'above' });
    expect(petPanelLayout({ x: 16, y: 16 }, size, bounds, 300)).toEqual({ left: 16, top: 168, width: 380, maxHeight: 556, side: 'below' });
  });
  it('places the menu beside the pet and leaves the saved point unchanged', () => {
    const point = { x: 824, y: 584 };
    const placed = petStackLayout(point, size, bounds, [{ width: 144, height: 28 }, { width: 176, height: 168 }]);
    expect(point).toEqual({ x: 824, y: 584 });
    expect(placed.map((item) => item.side)).toEqual(['above', 'above']);
    expect(placed[0].top + 28).toBeLessThanOrEqual(point.y);
    expect(placed[1].top).toBeLessThan(placed[0].top);
    expect(placed[1].left + placed[1].width).toBeLessThanOrEqual(bounds.width - bounds.right);
  });
  it('drops stacked chrome below a pet that sits against the top edge', () => {
    const placed = petStackLayout({ x: 16, y: 16 }, size, bounds, [{ width: 176, height: 180 }]);
    expect(placed[0]).toMatchObject({ left: 16, side: 'below' });
    expect(placed[0].top).toBeGreaterThanOrEqual(16 + size.height);
  });
  it('limits long panels to the larger side and narrows panels on mobile', () => {
    const panel = petPanelLayout({ x: 180, y: 250 }, size, { ...bounds, width: 360, height: 600 }, 1000);
    expect(panel).toEqual({ left: 16, top: 16, width: 328, maxHeight: 222, side: 'above' });
  });
});
