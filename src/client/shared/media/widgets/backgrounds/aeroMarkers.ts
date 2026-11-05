import type { AeroState } from './aeroState';
import type { AeroPaths } from './aeroPaths';
import type { AeroResources } from './aeroResources';
import { SAMPLES, CAMERA, DEPTHS, FADE, LEVELS, INTRO_SECONDS, MARKER_FLOATS, MARKER_PHASES, clamp, smoother, latticeHash, AeroSettings } from './aeroShardModel';
export function updateAeroMarkers(context: {
  state: AeroState;
  paths: AeroPaths['paths'];
  markerCounts: number[];
  markerStarts: number[];
  resources: AeroResources;
  container: HTMLDivElement;
  s: AeroSettings;
  dt: number;
  reduced: boolean;
  aspect: number;
  introOn: boolean;
  introAge: number;
  halfHeight: number;
  rings: Array<{
    x: number;
    y: number;
    age: number;
    strength: number;
  }>;
  flat: number[];
  screenOf: (x: number, y: number, z: number, out: number[]) => number;
  ringBand: (x: number, y: number, level: number) => number;
}) {
  const { state, paths, markerCounts, markerStarts, resources, container, s, dt, reduced, aspect, introOn, introAge, halfHeight, rings, flat, screenOf, ringBand } = context;
  const { output } = resources;
  let markerTotal = 0;
  for (let level = 0; level < LEVELS; level += 1) {
    markerCounts[level] = 0;
    markerStarts[level] = 0;
  }
  if (s.markers >= 0) {
    const ratio = output.size[1] / Math.max(container.clientHeight, 1);
    const pointerX = (state.pointer[0] - 0.5) * 2 * aspect;
    const pointerY = (0.5 - state.pointer[1]) * 2;
    const engaged = s.mouseInteraction && !reduced ? state.presence : 0;
    const previousTargets = state.targets;
    const nextTargets = new Map();
    const targetEase = 1 - Math.exp(-dt / 0.12);
    let nearestKey = '';
    let nearestGap = 72;
    for (let level = LEVELS - 1; level >= 0; level -= 1) {
      markerStarts[level] = markerTotal;
      const depth = DEPTHS[level];
      const depthScale = depth / CAMERA;
      const spacing = 0.42 * Math.pow(depthScale, 0.55);
      const halfW = ((aspect * depth) / (CAMERA * s.scale)) * 1.12 + spacing;
      const halfH = (depth / (CAMERA * s.scale)) * 1.12 + spacing;
      const drift = state.markerDrift;
      const phase = MARKER_PHASES[level];
      const i0 = Math.floor((drift - halfW) / spacing - phase[0]);
      const i1 = Math.ceil((drift + halfW) / spacing - phase[0]);
      const j0 = Math.floor(-halfH / spacing - phase[1]);
      const j1 = Math.ceil(halfH / spacing - phase[1]);
      const band = s.spread * (0.15 + 0.035 * depth) * 1.4;
      const position = paths[level].position;
      for (let i = i0; i <= i1; i += 1) {
        for (let j = j0; j <= j1; j += 1) {
          const keep = latticeHash(level, i, j, 11);
          if (keep > 0.5)
            continue;
          const x = (i + phase[0]) * spacing - drift;
          const y = (j + phase[1]) * spacing;
          const z = CAMERA - depth;
          const markerDepth = screenOf(x, y, z, flat);
          if (Math.abs(flat[0]) > aspect * 1.05 || Math.abs(flat[1]) > 1.05)
            continue;
          let best = Infinity;
          for (let k = 0; k < SAMPLES; k += 2) {
            const dx = x - position[k * 3];
            const dy = y - position[k * 3 + 1];
            const dz = z - position[k * 3 + 2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < best)
              best = d2;
          }
          const near = Math.exp(-best / (band * band));
          const blinkSeed = latticeHash(level, i, j, 23);
          const blinkRate = latticeHash(level, i, j, 37);
          const blink = blinkSeed < 0.07 ? 0.5 + 0.5 * Math.sin(state.clock * (1.4 + blinkRate * 2.2) + blinkRate * 40) : 0;
          const pointerGap = (Math.hypot(flat[0] - pointerX, flat[1] - pointerY) * halfHeight) / ratio;
          const key = `${level}:${i}:${j}`;
          if (level <= 2 && engaged > 0.01 && pointerGap < nearestGap) {
            nearestGap = pointerGap;
            nearestKey = key;
          }
          const wanted = key === state.markerTarget ? engaged * (1 - smoother((pointerGap - 30) / 42)) : 0;
          const before = previousTargets.get(key) ?? 0;
          const target = before + (wanted - before) * targetEase;
          if (target > 0.002)
            nextTargets.set(key, target);
          const bracket = Math.max(smoother((blink - 0.55) / 0.4), target);
          let ring = 0;
          if (rings.length)
            ring = ringBand(flat[0], flat[1], level);
          let reveal = 1;
          if (introOn) {
            const across = clamp((flat[0] / aspect + 1) * 0.5, 0, 1);
            const begin = level * 0.22 + 0.35 + across * (INTRO_SECONDS - 1.3 - (LEVELS - 1) * 0.22);
            reveal = smoother((introAge - begin) / 0.5);
          }
          const fade = FADE[level] * (1 - smoother((markerDepth - 3) / 10) * 0.45) * reveal;
          if (fade < 0.002)
            continue;
          if (markerTotal >= resources.markerCapacity)
            resources.ensureMarkers(resources.markerCapacity * 2);
          const o = markerTotal * MARKER_FLOATS;
          resources.markerData[o] = x;
          resources.markerData[o + 1] = y;
          resources.markerData[o + 2] = z;
          resources.markerData[o + 3] = fade;
          resources.markerData[o + 4] = 0.42 + 0.5 * near + blink * 0.9 + target * 1.3 + ring * 2.5;
          resources.markerData[o + 5] = bracket;
          resources.markerData[o + 6] = 1 + 0.15 * near + 0.3 * blink + 0.2 * target;
          resources.markerData[o + 7] = 0;
          markerTotal += 1;
          markerCounts[level] += 1;
        }
      }
    }
    state.targets = nextTargets;
    state.markerTarget = nearestKey;
  }
  state.markerTotal = markerTotal;
}
