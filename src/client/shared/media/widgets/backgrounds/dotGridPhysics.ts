import type { DotGridProps } from './dotGridRenderer';
import { smootherstep } from './dotGridRenderer';

interface DotGridPhysicsContext {
  s: Required<Omit<DotGridProps, 'dpr' | 'className' | 'style'>>;
  reduced: boolean;
  grid: { count: number; cols: number; rows: number; cell: number };
  pointer: { x: number; y: number; vx: number; vy: number; inside: boolean; presence: number };
  shocks: Array<{ x: number; y: number; start: number }>;
  rest: Float32Array; offset: Float32Array; velocity: Float32Array; force: Float32Array;
  next: Float32Array; wave: Float32Array; energy: Float32Array;
}

export const stepDotGridPhysics = (context: DotGridPhysicsContext, dt: number, now: number) => {
  const { s, reduced, grid, pointer, shocks, rest, offset, velocity, force, next, wave, energy } = context;
  const motion = reduced ? 0 : 1;
  const zeta = 1 - 0.85 * Math.min(1, Math.max(0, s.bounce));
  const omega = 4 / (zeta * Math.max(0.2, s.returnDuration));
  const stiffness = omega * omega;
  const damping = 2 * zeta * omega;
  const radius = Math.max(1, s.proximity);
  const speed = Math.hypot(pointer.vx, pointer.vy);
  const drive = s.mouseInteraction && pointer.inside ? 6500 * Math.tanh(speed / 900) * s.strength * motion : 0;
  const dirX = speed > 0.001 ? pointer.vx / speed : 0;
  const dirY = speed > 0.001 ? pointer.vy / speed : 0;
  const width = grid.cell * 1.4;
  const travel = 650;
  const active = shocks.map(shock => {
    const front = ((now - shock.start) / 1000) * travel;
    const power = smootherstep(1 - front / Math.max(1, s.shockRadius));
    return { ...shock, front, amplitude: power * s.shockStrength * grid.cell * 0.24 * motion };
  });
  const coupling = (Math.max(0, s.tension) * 900) ** 2 / (grid.cell * grid.cell);
  const viscosity = Math.sqrt(coupling) * 0.06;
  const limit = Math.sqrt(stiffness + 8 * coupling) + damping + 8 * viscosity;
  const steps = Math.min(24, Math.max(1, Math.ceil(dt / Math.min(1 / 120, 1.2 / limit))));
  const h = dt / steps;
  for (let i = 0; i < grid.count; i++) {
    const index = i * 2;
    const rx = rest[index];
    const ry = rest[index + 1];
    let ax = 0;
    let ay = 0;
    if (drive > 0) {
      const ex = rx + offset[index] - pointer.x;
      const ey = ry + offset[index + 1] - pointer.y;
      const distance = Math.hypot(ex, ey);
      if (distance < radius) {
        const weight = smootherstep(1 - distance / radius) * drive;
        const nx = distance > 0.001 ? ex / distance : 0;
        const ny = distance > 0.001 ? ey / distance : 0;
        ax += weight * (dirX + nx * 0.6);
        ay += weight * (dirY + ny * 0.6);
      }
    }
    let wx = 0;
    let wy = 0;
    let wvx = 0;
    let wvy = 0;
    for (const shock of active) {
      if (shock.amplitude <= 0) continue;
      const ex = rx - shock.x;
      const ey = ry - shock.y;
      const distance = Math.hypot(ex, ey);
      const u = (distance - shock.front) / width;
      if (Math.abs(u) < 3 && distance > 0.001) {
        const nx = ex / distance;
        const ny = ey / distance;
        const profile = Math.exp(-u * u);
        const push = shock.amplitude * profile;
        const rate = ((shock.amplitude * 2 * u * profile) / width) * travel;
        wx += nx * push;
        wy += ny * push;
        wvx += nx * rate;
        wvy += ny * rate;
        ax += nx * push * stiffness * 0.35;
        ay += ny * push * stiffness * 0.35;
      }
    }
    force[index] = ax;
    force[index + 1] = ay;
    const target = i * 4;
    wave[target] = wx;
    wave[target + 1] = wy;
    wave[target + 2] = wvx;
    wave[target + 3] = wvy;
  }
  const { cols, rows } = grid;
  const stride = cols * 2;
  for (let n = 0; n < steps; n++) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = (row * cols + col) * 2;
        let ax = force[index] - stiffness * offset[index] - damping * velocity[index];
        let ay = force[index + 1] - stiffness * offset[index + 1] - damping * velocity[index + 1];
        if (coupling > 0) {
          let lx = -4 * offset[index];
          let ly = -4 * offset[index + 1];
          let mx = -4 * velocity[index];
          let my = -4 * velocity[index + 1];
          if (col > 0) {
            lx += offset[index - 2];
            ly += offset[index - 1];
            mx += velocity[index - 2];
            my += velocity[index - 1];
          }
          if (col < cols - 1) {
            lx += offset[index + 2];
            ly += offset[index + 3];
            mx += velocity[index + 2];
            my += velocity[index + 3];
          }
          if (row > 0) {
            lx += offset[index - stride];
            ly += offset[index - stride + 1];
            mx += velocity[index - stride];
            my += velocity[index - stride + 1];
          }
          if (row < rows - 1) {
            lx += offset[index + stride];
            ly += offset[index + stride + 1];
            mx += velocity[index + stride];
            my += velocity[index + stride + 1];
          }
          ax += coupling * lx + viscosity * mx;
          ay += coupling * ly + viscosity * my;
        }
        next[index] = velocity[index] + ax * h;
        next[index + 1] = velocity[index + 1] + ay * h;
      }
    }
    for (let i = 0; i < offset.length; i++) {
      velocity[i] = next[i];
      offset[i] += velocity[i] * h;
    }
  }
  for (let i = 0; i < grid.count; i++) {
    const index = i * 2;
    const target = i * 4;
    energy[i] = Math.min(
      1,
      (Math.hypot(velocity[index] + wave[target + 2], velocity[index + 1] + wave[target + 3]) / 380) * 0.85 +
        (Math.hypot(offset[index] + wave[target], offset[index + 1] + wave[target + 1]) / (grid.cell * 2.2)) * 0.35
    );
  }
  for (let i = shocks.length - 1; i >= 0; i--) {
    if (active[i].front > s.shockRadius + width * 3) shocks.splice(i, 1);
  }
  const decay = 1 - Math.exp(-dt / 0.08);
  pointer.vx -= pointer.vx * decay;
  pointer.vy -= pointer.vy * decay;
  const presenceTarget = s.mouseInteraction && pointer.inside ? 1 : 0;
  pointer.presence += (presenceTarget - pointer.presence) * (1 - Math.exp(-dt / 0.2));
};

