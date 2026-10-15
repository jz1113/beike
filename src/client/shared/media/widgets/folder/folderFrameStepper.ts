import type { EngineState, ItemState, Settings, Slot } from './folderTypes';
import { TAU, BOOK_ANGLES, FLAP_ANGLES, clamp } from './folderMath';
import { approach, ensureItems, integrate, phaseOf, place, snap, velocityOf } from './folderSprings';

export const stepFolderFrame = (
  state: EngineState,
  getSettings: () => Settings,
  now: number,
  reduce: boolean,
  inPocket: (item: ItemState) => boolean,
  write: () => void,
  scheduleNext: (callback: (now: number) => void) => void
) => {
  state.raf = 0;
  const s = getSettings();
  const { g: geometry } = s;
  ensureItems(state, s.count);
  const time = now / 1000;
  const dt = state.last ? Math.min(0.05, (now - state.last) / 1000) : 1 / 60;
  state.last = now;
  const zeta = reduce ? 1 : 1 - 0.72 * s.bounce;
  const frontOmega = TAU * (geometry.book ? 1.55 : 2) * s.speed;
  const itemOmega = TAU * 2.1 * s.speed;
  const soft = TAU * 1.6 * s.speed;
  const phase = phaseOf(state, s, time);
  if (phase !== state.phase) {
    state.previous = state.phase;
    state.phase = phase;
    state.changedAt = now;
  }
  const elapsed = (now - state.changedAt) / 1000;
  let busy = time < state.receiveUntil;

  const ranks: number[] = [];
  state.items.forEach((item, index) => {
    if (item.place === 'inside') ranks.push(index);
  });
  const inside = ranks.length;
  ranks.forEach((index, rank) => {
    state.items[index].rank = rank;
  });
  if (state.focus >= 0 && phase !== 'open' && state.items[state.focus]?.place === 'inside') state.focus = -1;

  const intro = state.intro;
  if (!state.ready) intro.opening = s.open;
  if (intro.phase === 'run' && !intro.opening && (s.open || state.drag?.active)) intro.phase = 'done';
  const introTime = intro.phase === 'run' ? time - intro.start : 0;
  const staged = intro.phase !== 'done' && !intro.opening;
  const closeAt = (0.16 + inside * 0.085 + 0.3) / s.speed;
  const holding = staged && introTime < closeAt;
  const dropAt = (rank: number) => (0.16 + (inside - 1 - rank) * 0.085) / s.speed;
  const introPose = (item: ItemState, slot: Slot): Slot =>
    geometry.book
      ? { ...slot, r: slot.r + (item.rank % 2 ? 7 : -6), s: slot.s * 1.12 }
      : {
          ...slot,
          y: slot.y - (geometry.h * 0.8 + geometry.docH * 0.5),
          r: slot.r + (item.rank % 2 ? 9 : -7),
        };
  if (intro.phase === 'run') {
    busy = true;
    if (introTime > (intro.opening ? 1.4 : closeAt + 1) / s.speed) intro.phase = 'done';
  }
  const appear = intro.phase === 'wait' ? 0 : intro.phase === 'run' ? clamp(introTime / (0.34 / s.speed), 0, 1) : 1;
  state.appear = 1 - (1 - appear) ** 3;

  const closing = state.previous === 'open' && phase !== 'open';
  const frontDelay = closing && !reduce ? ((geometry.book ? 0.1 : 0.06) + 0.035 * inside) / s.speed : 0;
  const frontPhase = elapsed < frontDelay ? state.previous : phase;
  const frontTarget = holding
    ? geometry.book
      ? -150
      : -42
    : (geometry.book ? BOOK_ANGLES : FLAP_ANGLES)[frontPhase];

  if (!state.ready) {
    state.ready = true;
    const opening = intro.phase !== 'done' && intro.opening;
    if (opening) {
      state.phase = 'rest';
      state.previous = 'rest';
    }
    snap(state.front, opening ? 0 : frontTarget);
    snap(state.anchor, staged ? 1 : 0);
    state.items.forEach(item => {
      const slot = place(state, item.rank, inside, opening ? 'rest' : phase, s);
      const target = staged ? introPose(item, slot) : slot;
      snap(item.x, target.x);
      snap(item.y, target.y);
      snap(item.z, target.z);
      snap(item.r, target.r);
      snap(item.ry, target.ry);
      snap(item.s, target.s);
      snap(item.alpha, staged ? 0 : 1);
      snap(item.hover, staged && geometry.book ? 3 : 0);
      item.fresh = false;
    });
  }

  if (intro.phase === 'wait') {
    write();
    state.last = 0;
    return;
  }

  busy = integrate(state.front, frontTarget, frontOmega, zeta, dt) || busy;
  const restitution = 0.2 + 0.35 * s.bounce;
  if (geometry.book && state.front.value < -180) {
    state.front.value = -360 - state.front.value;
    state.front.velocity = -state.front.velocity * restitution;
  } else if (state.front.value > 0) {
    state.front.value = -state.front.value;
    state.front.velocity = -state.front.velocity * restitution;
  }
  if (elapsed < frontDelay) busy = true;
  busy = integrate(state.anchor, staged ? 1 : 0, frontOmega, 1, dt) || busy;

  const engaged = state.hovered && !reduce;
  busy = integrate(state.rx, engaged ? -state.pointerY * 8 * s.tilt : 0, soft, 1, dt) || busy;
  busy = integrate(state.ry, engaged ? state.pointerX * 10 * s.tilt : 0, soft, 1, dt) || busy;
  busy = integrate(state.lift, state.hovered && phase !== 'open' ? 1 : 0, soft, 1, dt) || busy;
  busy = integrate(state.squash, state.pressed ? 0.975 : 1, TAU * 3.2, 0.6, dt) || busy;

  const opening = phase === 'open' && state.previous !== 'open';
  const drag = state.drag?.active ? state.drag : null;
  const hover = state.hoveredItem;
  const hovering = !drag && hover >= 0 && state.items[hover] ? state.items[hover] : null;
  const lead =
    hovering && hovering.place === 'inside' && phase === 'open' ? place(state, hovering.rank, inside, 'open', s) : null;
  const focusScale = clamp(((geometry.tabH + geometry.h) * 1.18) / geometry.docH, 1.2, 2.2);
  const focusY = geometry.book ? geometry.tabH + geometry.h / 2 : geometry.tabH + geometry.h * 0.36;

  state.items.forEach((item, index) => {
    if (item.fresh) {
      const start = place(state, item.rank, inside, 'rest', s);
      snap(item.x, start.x);
      snap(item.y, start.y);
      snap(item.r, start.r);
      item.fresh = false;
    }
    let target: Slot;
    let omega = itemOmega;
    let damping = zeta;
    let lift = 0;
    let fade = 1;
    let magnet = false;

    if (state.focus === index) {
      target = { x: geometry.w / 2, y: focusY, z: 28 * geometry.scale, r: 0, ry: 0, s: focusScale };
      omega = TAU * 3.6;
      lift = 2;
      item.layer = 'focus';
    } else if (drag && drag.index === index) {
      const [vx] = velocityOf(drag.samples);
      target = {
        x: state.deskX + drag.grabX,
        y: state.deskY + drag.grabY,
        z: 0,
        r: clamp(vx * 0.012, -14, 14),
        ry: 0,
        s: drag.scale * 1.05,
      };
      omega = TAU * 5;
      damping = 0.78;
      lift = 1.4;
      if (!item.elevated && !inPocket(item)) item.elevated = true;
      item.layer = item.elevated ? 'drag' : 'inside';
    } else if (item.place === 'out') {
      target = { x: item.outX, y: item.outY, z: 0, r: item.outR, ry: 0, s: item.outS };
      lift = hover === index ? 1 : 0.15;
      magnet = hover === index;
      item.layer = 'out';
    } else {
      const order = opening ? (geometry.book ? inside - 1 - item.rank : item.rank) : item.rank;
      const delay = reduce
        ? 0
        : opening
          ? ((geometry.book ? 0.16 : 0.05) + order * (geometry.book ? 0.055 : 0.045)) / s.speed
          : (order * 0.03) / s.speed;
      const active = elapsed >= delay ? phase : state.previous;
      target = place(state, item.rank, inside, active, s);
      if (elapsed < delay) busy = true;
      if (staged && introTime < dropAt(item.rank)) {
        target = introPose(item, target);
        fade = 0;
        lift = geometry.book ? 3 : 0;
        item.layer = 'inside';
      } else if (item.insertUntil > time) {
        busy = true;
        target = approach(item, target, s);
        item.layer = 'drag';
        lift = 0.6;
      } else {
        item.insertUntil = 0;
        item.elevated = false;
        item.layer = 'inside';
        if (lead && active === 'open') {
          if (hover === index) {
            target = { ...target, y: target.y - 6 * geometry.scale, r: target.r * 0.2, ry: 0, s: target.s * 1.05 };
            lift = 1;
            magnet = true;
          } else {
            const distance = target.x - lead.x;
            target = {
              ...target,
              x:
                target.x +
                Math.sign(distance) * 12 * geometry.scale * Math.max(0, 1 - Math.abs(distance) / (geometry.w * 1.1)),
            };
            lift = 0.2;
          }
        } else if (active === 'open') {
          lift = 0.2;
        }
      }
    }
    busy = integrate(item.x, target.x, omega, damping, dt) || busy;
    busy = integrate(item.y, target.y, omega, damping, dt) || busy;
    if (!geometry.book && item.layer === 'inside') {
      const tilt = (item.r.value * Math.PI) / 180;
      const reach =
        ((geometry.docW * Math.abs(Math.sin(tilt)) + geometry.docH * Math.abs(Math.cos(tilt))) * item.s.value) / 2;
      const floor = geometry.tabH + geometry.h - 2 * geometry.scale - reach;
      if (item.y.value > floor) {
        item.y.value = floor;
        if (item.y.velocity > 0) item.y.velocity *= -0.25;
      }
    }
    busy = integrate(item.z, target.z, itemOmega, zeta, dt) || busy;
    busy = integrate(item.r, target.r, omega, damping, dt) || busy;
    busy = integrate(item.ry, target.ry, itemOmega, zeta, dt) || busy;
    busy = integrate(item.s, target.s, itemOmega, zeta, dt) || busy;
    busy = integrate(item.hover, lift, itemOmega, zeta, dt) || busy;
    busy = integrate(item.alpha, fade, TAU * 3 * s.speed, 1, dt) || busy;
    busy = integrate(item.mx, magnet ? item.localX * 7 * geometry.scale : 0, soft, 0.85, dt) || busy;
    busy = integrate(item.my, magnet ? item.localY * 7 * geometry.scale : 0, soft, 0.85, dt) || busy;
  });

  write();
  if (busy || drag) scheduleNext((n) => stepFolderFrame(state, getSettings, n, reduce, inPocket, write, scheduleNext));
  else state.last = 0;
};
