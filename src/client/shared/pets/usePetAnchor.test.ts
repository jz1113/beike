import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePetAnchor } from './usePetAnchor';

const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], effects: [] as (() => void | (() => void))[] }));
vi.mock('react', () => ({
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => {
      hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value;
    }];
  },
  useRef(current: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current };
    return hooks.values[index];
  },
  useCallback(callback: unknown) { return callback; },
  useLayoutEffect(effect: () => void | (() => void)) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) { hooks.effects.push(effect); hooks.values[index] = true; }
  },
}));

type Pet = ReturnType<typeof usePetAnchor>;
type Pointer = Parameters<Pet['pointerProps']['onPointerDown']>[0];
const onDrag = vi.fn();
const listeners = new Map<string, () => void>();
let cleanups: (() => void)[];
let width: number;
let height: number;
let captured: boolean;
const target = {
  setPointerCapture: vi.fn(() => { captured = true; }),
  hasPointerCapture: vi.fn(() => captured),
  releasePointerCapture: vi.fn(() => { captured = false; }),
};
function PetHarness() { hooks.cursor = 0; return usePetAnchor(false, onDrag); }
function pointer(x: number, y: number, extra = {}) {
  return { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, currentTarget: target, preventDefault: vi.fn(), ...extra } as unknown as Pointer;
}
function mount() {
  const pet = PetHarness();
  pet.rootRef.current = { getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }), get clientWidth() { return width; }, get clientHeight() { return height; } } as HTMLDivElement;
  pet.anchorRef.current = { getBoundingClientRect: () => ({ width: 160, height: 140 }) } as HTMLDivElement;
  cleanups = hooks.effects.map((effect) => effect()).filter((value): value is () => void => typeof value === 'function');
  return PetHarness();
}
function click(pet: Pet, detail = 1) {
  const event = { detail, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  pet.pointerProps.onClickCapture(event as unknown as Parameters<Pet['pointerProps']['onClickCapture']>[0]);
  return event;
}

beforeEach(() => {
  hooks.cursor = 0; hooks.values = []; hooks.effects = []; cleanups = [];
  width = 1000; height = 740; captured = false; listeners.clear(); vi.clearAllMocks();
  vi.stubGlobal('window', {
    get innerWidth() { return width; }, get innerHeight() { return height; },
    localStorage: { getItem: vi.fn(() => '{"x":200,"y":200}'), setItem: vi.fn() },
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name),
  });
  vi.stubGlobal('getComputedStyle', () => ({ paddingTop: '16', paddingLeft: '16', paddingBottom: '16', paddingRight: '16' }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { cleanups.forEach((cleanup) => cleanup()); vi.unstubAllGlobals(); });

describe('cover pet pointer positioning', () => {
  it('restores a saved position and keeps a small movement as an ordinary click', () => {
    const pet = mount();
    expect(pet.anchorStyle).toEqual({ left: 200, top: 200 });
    pet.pointerProps.onPointerDown(pointer(210, 210));
    pet.pointerProps.onPointerMove(pointer(212, 213));
    pet.pointerProps.onPointerUp(pointer(212, 213));
    expect(PetHarness().anchorStyle).toEqual({ left: 200, top: 200 });
    expect(onDrag).not.toHaveBeenCalled();
    expect(click(pet).preventDefault).not.toHaveBeenCalled();
  });
  it.each(['mouse', 'touch', 'pen'])('moves with %s, closes the panel once, persists and suppresses only the trailing click', (pointerType) => {
    const pet = mount();
    pet.pointerProps.onPointerDown(pointer(210, 210, { pointerType }));
    pet.pointerProps.onPointerMove(pointer(250, 270, { pointerType }));
    pet.pointerProps.onPointerMove(pointer(260, 280, { pointerType }));
    expect(PetHarness().moving).toBe(true);
    expect(PetHarness().anchorStyle).toEqual({ left: 250, top: 270 });
    expect(onDrag).toHaveBeenCalledTimes(1);
    pet.pointerProps.onPointerUp(pointer(260, 280));
    expect(PetHarness().moving).toBe(false);
    expect(window.localStorage.setItem).toHaveBeenLastCalledWith('beike.pet.position.v1', '{"x":250,"y":270}');
    expect(click(pet, 0).preventDefault).not.toHaveBeenCalled();
    expect(click(pet).stopPropagation).toHaveBeenCalled();
    expect(click(pet).stopPropagation).not.toHaveBeenCalled();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
  });
  it.each(['onPointerCancel', 'onLostPointerCapture'] as const)('cleans up %s and permits the next gesture', (handler) => {
    const pet = mount();
    pet.pointerProps.onPointerDown(pointer(210, 210));
    pet.pointerProps.onPointerMove(pointer(230, 250));
    pet.pointerProps[handler](pointer(230, 250));
    pet.pointerProps.onPointerMove(pointer(600, 600));
    expect(PetHarness().anchorStyle).toEqual({ left: 220, top: 240 });
    expect(PetHarness().moving).toBe(false);
    pet.pointerProps.onPointerDown(pointer(230, 250));
    pet.pointerProps.onPointerUp(pointer(230, 250));
    expect(click(pet).preventDefault).not.toHaveBeenCalled();
  });
  it('ignores secondary buttons, extra pointers and unrelated pointer releases', () => {
    const pet = mount();
    pet.pointerProps.onPointerDown(pointer(0, 0, { button: 2 }));
    pet.pointerProps.onPointerDown(pointer(0, 0, { isPrimary: false }));
    expect(target.setPointerCapture).not.toHaveBeenCalled();
    pet.pointerProps.onPointerDown(pointer(210, 210));
    pet.pointerProps.onPointerMove(pointer(900, 900, { pointerId: 2 }));
    pet.pointerProps.onPointerUp(pointer(900, 900, { pointerId: 2 }));
    pet.pointerProps.onPointerMove(pointer(215, 210));
    expect(onDrag).toHaveBeenCalledOnce();
    expect(PetHarness().anchorStyle).toEqual({ left: 205, top: 200 });
  });
  it('clamps all edges and corrects coordinates on resize', () => {
    const pet = mount();
    pet.pointerProps.onPointerDown(pointer(210, 210));
    pet.pointerProps.onPointerMove(pointer(9999, -9999));
    expect(PetHarness().anchorStyle).toEqual({ left: 824, top: 16 });
    width = 400; height = 400; listeners.get('resize')?.();
    expect(PetHarness().anchorStyle).toEqual({ left: 224, top: 16 });
    expect(PetHarness().moving).toBe(false);
  });
  it('moves when storage reads and writes throw and releases capture on unmount', () => {
    Object.defineProperty(window, 'localStorage', { get() { throw Error('blocked'); } });
    const pet = mount();
    expect(pet.anchorStyle).toEqual({ left: 824, top: 584 });
    pet.pointerProps.onPointerDown(pointer(900, 600));
    pet.pointerProps.onPointerMove(pointer(800, 500));
    expect(PetHarness().anchorStyle).toEqual({ left: 724, top: 484 });
    cleanups.forEach((cleanup) => cleanup()); cleanups = [];
    expect(captured).toBe(false);
    expect(listeners.size).toBe(0);
    pet.pointerProps.onPointerMove(pointer(700, 400));
    expect(PetHarness().anchorStyle).toEqual({ left: 724, top: 484 });
  });
  it('handles failed pointer capture without entering a gesture', () => {
    const pet = mount();
    target.setPointerCapture.mockImplementationOnce(() => { throw Error('inactive'); });
    pet.pointerProps.onPointerDown(pointer(210, 210));
    pet.pointerProps.onPointerMove(pointer(300, 300));
    expect(onDrag).not.toHaveBeenCalled();
    expect(PetHarness().moving).toBe(false);
  });
});
