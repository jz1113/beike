import { type Settings, clamp, seeded, easeOut, wrap, MAX_LINKED, MAX_LINES, DEPTH, FOCAL, NEAR, FAR, BURST_SECONDS, BURST_SPEED, BURST_WIDTH } from './particlesRenderer';

interface ParticleSimulationContext {
  gl: WebGL2RenderingContext;
  positionBuffer: WebGLBuffer | null; randomBuffer: WebGLBuffer | null; colorBuffer: WebGLBuffer | null;
  parse: (color: string) => number[]; ink: (color: number[]) => number[];
  view: { width: number; height: number };
  pointer: { sx: number; sy: number; active: number };
  state: { clock: number; spin: number; travel: number; offsetX: number; offsetY: number; reveal: number };
  bursts: Array<{ x: number; y: number; age: number }>;
  cloud: { key: string; count: number; positions: Float32Array; randoms: Float32Array; colors: Float32Array };
  screen: { x: Float32Array; y: Float32Array; ahead: Float32Array; alpha: Float32Array };
  lineData: Float32Array;
}

export function createParticleSimulation(context: ParticleSimulationContext) {
  const { gl, positionBuffer, randomBuffer, colorBuffer, parse, ink, view, pointer, state, bursts, cloud, screen, lineData } = context;
const rebuild = (s: Settings) => {
  const key = `${s.count}|${s.variation}|${s.colors.join(',')}|${s.lightMode ? 1 : 0}`;
  if (key === cloud.key) return;
  cloud.key = key;
  const next = seeded(s.variation * 7919 + 1);
  const total = s.count;
  const positions = new Float32Array(total * 3);
  const randoms = new Float32Array(total * 4);
  const tints = new Float32Array(total * 3);
  const swatches = s.colors.map(value => (s.lightMode ? ink(parse(value)) : parse(value)));
  for (let i = 0; i < total; i++) {
    let x: number;
    let y: number;
    let z: number;
    let len: number;
    do {
      x = next() * 2 - 1;
      y = next() * 2 - 1;
      z = next() * 2 - 1;
      len = x * x + y * y + z * z;
    } while (len > 1 || len === 0);
    const r = Math.cbrt(next());
    positions.set([x * r, y * r, z * r], i * 3);
    randoms.set([next(), next(), next(), next()], i * 4);
    tints.set(swatches[Math.floor(next() * swatches.length)], i * 3);
  }
  cloud.count = total;
  cloud.positions = positions;
  cloud.randoms = randoms;
  cloud.colors = tints;
  const linked = Math.min(total, MAX_LINKED);
  screen.x = new Float32Array(linked);
  screen.y = new Float32Array(linked);
  screen.ahead = new Float32Array(linked);
  screen.alpha = new Float32Array(linked);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, randomBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, randoms, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, tints, gl.STATIC_DRAW);
};

const rotationOf = (s: Settings): number[] => {
  const elapsed = state.clock * 1000;
  const x = s.rotate ? Math.sin(elapsed * 0.0002) * 0.1 : 0;
  const y = s.rotate ? Math.cos(elapsed * 0.0005) * 0.15 : 0;
  const z = s.rotate ? state.spin : 0;
  const [sx, cx, sy, cy, sz, cz] = [Math.sin(x), Math.cos(x), Math.sin(y), Math.cos(y), Math.sin(z), Math.cos(z)];
  return [
    cy * cz + sy * sx * sz,
    cx * sz,
    -sy * cz + cy * sx * sz,
    -cy * sz + sy * sx * cz,
    cx * cz,
    sy * sz + cy * sx * cz,
    sy * cx,
    -sx,
    cy * cx
  ];
};

const offsetOf = (): [number, number, number] => [state.offsetX, state.offsetY, -(1 - easeOut(state.reveal)) * 70];

const project = (s: Settings, matrix: number[]) => {
  const total = Math.min(cloud.count, MAX_LINKED);
  const [ox, oy, oz] = offsetOf();
  const aspect = view.width / view.height;
  const time = state.clock;
  const radius = s.hoverRadius;
  const active = s.hoverEffect !== 0 ? pointer.active : 0;
  const spanY = s.spread * 2 + 3;
  const spanZ = s.spread * DEPTH * 2 + 3;
  for (let i = 0; i < total; i++) {
    const px = cloud.positions[i * 3] * s.spread;
    const py = cloud.positions[i * 3 + 1] * s.spread;
    const pz = cloud.positions[i * 3 + 2] * s.spread * DEPTH;
    const r0 = cloud.randoms[i * 4];
    const r1 = cloud.randoms[i * 4 + 1];
    const r2 = cloud.randoms[i * 4 + 2];
    const r3 = cloud.randoms[i * 4 + 3];
    const bobX = Math.sin(time * r2 + 6.28 * r3) * (0.1 + 1.4 * r0);
    const bobY = Math.sin(time * r1 + 6.28 * r0) * (0.1 + 1.4 * r3);
    const bobZ = Math.sin(time * r3 + 6.28 * r1) * (0.1 + 1.4 * r2);
    const wx = matrix[0] * px + matrix[3] * py + matrix[6] * pz + ox + bobX;
    let wy = matrix[1] * px + matrix[4] * py + matrix[7] * pz + oy + bobY;
    let wz = matrix[2] * px + matrix[5] * py + matrix[8] * pz + oz + bobZ;
    let edge = 1;
    if (s.drift === 1 || s.drift === 2) {
      const k = wrap(r3 * spanY + oy + bobY + (s.drift === 1 ? state.travel : -state.travel), spanY);
      wy = k - spanY / 2;
      const low = clamp(k / (spanY * 0.12), 0, 1);
      const high = clamp((spanY - k) / (spanY * 0.12), 0, 1);
      edge = low * low * (3 - 2 * low) * high * high * (3 - 2 * high);
    } else if (s.drift === 3) {
      const k = wrap(r1 * spanZ + oz + bobZ + state.travel, spanZ);
      wz = k - spanZ / 2;
      const fresh = clamp(k / (spanZ * 0.1), 0, 1);
      edge = fresh * fresh * (3 - 2 * fresh);
    }
    const ahead = s.camera - wz;
    if (ahead < NEAR || ahead > FAR) {
      screen.alpha[i] = 0;
      continue;
    }
    const close = clamp((ahead - 1) / 3, 0, 1);
    edge *= close * close * (3 - 2 * close);
    let sx = ((wx * FOCAL) / aspect / ahead) * 0.5 * view.width + view.width / 2;
    let sy = ((wy * FOCAL) / ahead) * 0.5 * view.height + view.height / 2;
    let dx = 0;
    let dy = 0;
    if (active > 0.001) {
      const ex = sx - pointer.sx;
      const ey = sy - pointer.sy;
      const reach = Math.hypot(ex, ey);
      const falloff = Math.exp(-(ex * ex + ey * ey) / (radius * radius)) * s.hoverFactor * active;
      if (s.hoverEffect === 1 && reach > 0.001) {
        dx += (ex / reach) * radius * 0.5 * falloff;
        dy += (ey / reach) * radius * 0.5 * falloff;
      } else if (s.hoverEffect === 2) {
        dx -= ex * 0.6 * falloff;
        dy -= ey * 0.6 * falloff;
      }
    }
    for (const burst of bursts) {
      const progress = burst.age / BURST_SECONDS;
      const ex = sx - burst.x;
      const ey = sy - burst.y;
      const reach = Math.hypot(ex, ey);
      if (reach < 0.001) continue;
      const wave = Math.exp(-Math.pow((reach - progress * BURST_SPEED) / BURST_WIDTH, 2));
      const ramp = clamp(reach / 30, 0, 1);
      const push = wave * (1 - progress) * (1 - progress) * 56 * ramp * ramp * (3 - 2 * ramp);
      dx += (ex / reach) * push;
      dy += (ey / reach) * push;
    }
    sx += dx;
    sy += dy;
    const far = clamp((FAR - ahead) / (FAR - FAR * 0.9), 0, 1);
    const reveal = clamp(state.reveal * 1.6 - r2 * 0.6, 0, 1);
    screen.x[i] = sx;
    screen.y[i] = sy;
    screen.ahead[i] = ahead;
    screen.alpha[i] = far * far * (3 - 2 * far) * edge * reveal * reveal;
  }
  return total;
};

const buildLines = (s: Settings, matrix: number[]) => {
  const total = project(s, matrix);
  const reach = s.connectionDistance;
  const columns = Math.max(1, Math.ceil(view.width / reach) + 2);
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < total; i++) {
    if (screen.alpha[i] < 0.02) continue;
    const key = (Math.floor(screen.y[i] / reach) + 1) * columns + Math.floor(screen.x[i] / reach) + 1;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  }
  let lineCount = 0;
  const limit = reach * reach;
  for (const [key, members] of buckets) {
    for (const offset of [0, 1, columns - 1, columns, columns + 1]) {
      const others = offset === 0 ? members : buckets.get(key + offset);
      if (!others) continue;
      for (let a = 0; a < members.length; a++) {
        const i = members[a];
        for (let b = offset === 0 ? a + 1 : 0; b < others.length; b++) {
          const j = others[b];
          const dx = screen.x[i] - screen.x[j];
          const dy = screen.y[i] - screen.y[j];
          const gap = dx * dx + dy * dy;
          if (gap > limit) continue;
          const layer = clamp(1 - Math.abs(screen.ahead[i] - screen.ahead[j]) / 18, 0, 1);
          if (layer <= 0) continue;
          if (lineCount >= MAX_LINES) return lineCount;
          const fade = 1 - Math.sqrt(gap) / reach;
          const base = lineCount * 8;
          lineData[base] = screen.x[i];
          lineData[base + 1] = screen.y[i];
          lineData[base + 2] = screen.x[j];
          lineData[base + 3] = screen.y[j];
          lineData[base + 4] = (cloud.colors[i * 3] + cloud.colors[j * 3]) / 2;
          lineData[base + 5] = (cloud.colors[i * 3 + 1] + cloud.colors[j * 3 + 1]) / 2;
          lineData[base + 6] = (cloud.colors[i * 3 + 2] + cloud.colors[j * 3 + 2]) / 2;
          lineData[base + 7] = fade * fade * layer * 0.7 * Math.min(screen.alpha[i], screen.alpha[j]);
          lineCount++;
        }
      }
    }
  }
  return lineCount;
};

  return { rebuild, rotationOf, offsetOf, buildLines };
}
