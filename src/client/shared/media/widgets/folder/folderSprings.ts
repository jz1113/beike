import type { EngineState, ItemState, Phase, Settings, Slot, Spring } from './folderTypes';
import { STEP, placeBook, placeFlap } from './folderMath';

export const createSpring = (value: number): Spring => ({ value, velocity: 0 });

export const snap = (spring: Spring, value: number) => {
  spring.value = value;
  spring.velocity = 0;
};

export const integrate = (item: Spring, target: number, omega: number, zeta: number, dt: number): boolean => {
  const k = omega * omega;
  const d = 2 * zeta * omega;
  const steps = Math.max(1, Math.ceil(dt / STEP));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    item.velocity += (k * (target - item.value) - d * item.velocity) * step;
    item.value += item.velocity * step;
  }
  return Math.abs(target - item.value) > 0.01 || Math.abs(item.velocity) > 0.01;
};

export const createEngineState = (): EngineState => ({
  raf: 0,
  last: 0,
  ready: false,
  hovered: false,
  pressed: false,
  pointerX: 0,
  pointerY: 0,
  deskX: 0,
  deskY: 0,
  hoveredItem: -1,
  phase: 'rest',
  previous: 'rest',
  changedAt: 0,
  front: createSpring(0),
  rx: createSpring(0),
  ry: createSpring(0),
  lift: createSpring(0),
  squash: createSpring(1),
  items: [],
  focus: -1,
  drag: null,
  receiving: false,
  receiveUntil: 0,
  suppressClick: false,
  dropCount: 0,
  intro: { phase: 'done', start: 0, opening: false },
  anchor: createSpring(0),
  appear: 1,
  content: { key: '', entries: null, renderer: null },
});

export const ensureItems = (state: EngineState, n: number) => {
  while (state.items.length < n) {
    state.items.push({
      x: createSpring(0),
      y: createSpring(0),
      z: createSpring(0),
      r: createSpring(0),
      ry: createSpring(0),
      s: createSpring(1),
      hover: createSpring(0),
      mx: createSpring(0),
      my: createSpring(0),
      alpha: createSpring(1),
      place: 'inside',
      rank: 0,
      layer: 'inside',
      elevated: false,
      insertUntil: 0,
      insertFrom: null,
      outX: 0,
      outY: 0,
      outR: 0,
      outS: 1,
      outOrder: 0,
      localX: 0,
      localY: 0,
      fresh: true,
    });
  }
  if (state.items.length > n) {
    state.items.length = n;
  }
};

export const phaseOf = (state: EngineState, s: Settings, time: number): Phase => {
  if (s.open) return 'open';
  if (state.receiving || time < state.receiveUntil) return 'receive';
  if (s.peek && state.hovered && !state.drag?.active) return 'peek';
  return 'rest';
};

export const place = (state: EngineState, rank: number, inside: number, phase: Phase, s: Settings) => {
  if (s.g.book) return placeBook(rank, inside, phase, s.layout, s.g);
  const pointer = state.hovered ? ((state.pointerX + 1) / 2) * s.g.w : null;
  return placeFlap(rank, inside, phase, s.layout, s.g, pointer);
};

export const approach = (item: ItemState, slot: Slot, s: Settings): Slot => {
  const { g: geometry } = s;
  if (item.insertFrom === 'side') {
    return { ...slot, x: Math.max(slot.x, geometry.w + geometry.docW * 0.54 * slot.s) };
  }
  return { ...slot, y: Math.min(slot.y, geometry.frontTop - geometry.docH * 0.5 * slot.s - 8 * geometry.scale) };
};

export const velocityOf = (samples: number[][]): [number, number] => {
  if (samples.length < 2) return [0, 0];
  const first = samples[0];
  const last = samples[samples.length - 1];
  const span = Math.max(0.016, (last[0] - first[0]) / 1000);
  return [(last[1] - first[1]) / span, (last[2] - first[2]) / span];
};
