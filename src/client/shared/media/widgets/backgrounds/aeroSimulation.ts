import type { AeroCamera, AeroResources, AeroState } from './aeroResources';
import type { AeroPaths } from './aeroPaths';
import { updateAeroMarkers } from './aeroMarkers';
import {
  AeroSettings,
  CAMERA,
  DEPTHS,
  FLOATS,
  GROWTH,
  INTRO_SECONDS,
  LEVELS,
  MAX_BANK,
  RING_SECONDS,
  SAMPLES,
  TAU,
  clamp,
  smoother,
} from './aeroShardModel';
export function createAeroSimulation(state: AeroState, resources: AeroResources, pathState: AeroPaths, camera: AeroCamera, container: HTMLDivElement) {
  const { paths, buildPaths, markerCounts, markerStarts } = pathState;
  const { cam, ray, rayAt } = camera;
  const simulate = (s: AeroSettings, dt: number, reduced: boolean) => {
    const { staging, depths, output } = resources;
    const aspect = output.size[0] / Math.max(output.size[1], 1);
    const closed = buildPaths(aspect);
    const introOn = s.intro && !reduced;
    const introAge = state.introAt < 0 ? 0 : state.clock - state.introAt;
    const hover = s.mouseInteraction && !reduced ? state.presence * s.mouseStrength : 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    if (hover > 0.001) {
      rayAt(state.pointer[0], state.pointer[1]);
      rx = ray[0];
      ry = ray[1];
      rz = ray[2];
    }
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / Math.max(steps, 1);
    const halfHeight = output.size[1] * 0.5;
    const rings = state.rings.map(ring => {
      const life = ring.age / RING_SECONDS;
      return {
        x: ring.x,
        y: ring.y,
        age: ring.age,
        strength: (1 - Math.exp(-ring.age / 0.06)) * (1 - life) * (1 - life)
      };
    });
    const screenOf = (x: number, y: number, z: number, out: number[]) => {
      const ex = x - cam.eye[0];
      const ey = y - cam.eye[1];
      const ez = z - cam.eye[2];
      const depth = Math.max(ex * cam.forward[0] + ey * cam.forward[1] + ez * cam.forward[2], 0.05);
      out[0] = ((ex * cam.right[0] + ey * cam.right[1] + ez * cam.right[2]) * cam.focal) / depth / halfHeight;
      out[1] = ((ex * cam.up[0] + ey * cam.up[1] + ez * cam.up[2]) * cam.focal) / depth / halfHeight;
      return depth;
    };
    const ringBand = (sx: number, sy: number, level: number) => {
      let total = 0;
      for (const ring of rings) {
        const radius = Math.max(0, ring.age - level * 0.07) * 2.3;
        const distance = Math.hypot(sx - ring.x, sy - ring.y);
        total += Math.exp(-((distance - radius) * (distance - radius)) / 0.012) * ring.strength;
      }
      return total;
    };
    const flat = [0, 0];
    const shards = state.shards;
    const twistWeight = Math.min(1, s.twist);
    for (let index = 0; index < shards.length; index += 1) {
      const shard = shards[index];
      const level = shard.level;
      const path = paths[level];
      let s0 = (shard.phase + state.travel[level]) % 1;
      let appear = 1;
      let introBank = 0;
      if (introOn) {
        const begin = level * 0.22 + Math.max(0, s0 - 0.1) * (INTRO_SECONDS - 1.0 - (LEVELS - 1) * 0.22) + shard.arrive * 0.15;
        const local = clamp((introAge - begin) / 0.9, 0, 1);
        appear = smoother(local);
        const glide = (1 - local) * (1 - local);
        s0 = closed ? s0 - glide * 0.06 : Math.max(0, s0 - glide * 0.06);
        introBank = glide * 0.9 * shard.sign;
      }
      shard.s = s0;
      const f = (((s0 % 1) + 1) % 1) * (SAMPLES - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(i0 + 1, SAMPLES - 1);
      const t = f - i0;
      const at = (array: Float32Array, c: number) => array[i0 * 3 + c] + (array[i1 * 3 + c] - array[i0 * 3 + c]) * t;
      const cx = at(path.position, 0);
      const cy = at(path.position, 1);
      const cz = at(path.position, 2);
      const tx = at(path.tangent, 0);
      const ty = at(path.tangent, 1);
      const tz = at(path.tangent, 2);
      const ax0 = at(path.across, 0);
      const ay0 = at(path.across, 1);
      const az0 = at(path.across, 2);
      const lx0 = at(path.lift, 0);
      const ly0 = at(path.lift, 1);
      const lz0 = at(path.lift, 2);
      const angle = s.twist * (s0 * TAU * 0.6 + state.twist + level * 1.7);
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const ax = ax0 * ca + lx0 * sa;
      const ay = ay0 * ca + ly0 * sa;
      const az = az0 * ca + lz0 * sa;
      const bx = lx0 * ca - ax0 * sa;
      const by = ly0 * ca - ay0 * sa;
      const bz = lz0 * ca - az0 * sa;
      const depthScale = DEPTHS[level] / CAMERA;
      const width = s.spread * (0.15 + 0.035 * DEPTHS[level]) * (0.8 + 0.3 * Math.sin(s0 * TAU * 1.3 + level * 0.8));
      const lane = shard.lane * width;
      const layer = shard.layer * 0.012 * depthScale;
      const taper = closed ? 1 : smoother(s0 / 0.12) * smoother((1 - s0) / 0.12);
      const billow = s.billow *
        0.16 *
        depthScale *
        Math.sin(s0 * TAU * 1.3 - state.drift * 0.5 + level * 1.1) *
        (0.4 + 0.6 * taper);
      const sway = s.billow * 0.06 * depthScale * Math.sin(s0 * TAU * 0.8 - state.drift * 0.35 + level * 2.4);
      const wobble = 0.009 * depthScale;
      const drift = state.drift;
      const hx = cx +
        lx0 * billow +
        ax0 * sway +
        ax * lane +
        bx * layer +
        Math.sin(drift * shard.rate[0] + shard.drift[0]) * wobble;
      const hy = cy +
        ly0 * billow +
        ay0 * sway +
        ay * lane +
        by * layer +
        Math.sin(drift * shard.rate[1] + shard.drift[1]) * wobble;
      const hz = cz +
        lz0 * billow +
        az0 * sway +
        az * lane +
        bz * layer +
        Math.sin(drift * shard.rate[2] + shard.drift[2]) * wobble;
      let fx = 0;
      let fy = 0;
      let fz = 0;
      let tiltTarget = 0;
      const px = hx + shard.offset[0];
      const py = hy + shard.offset[1];
      const pz = hz + shard.offset[2];
      if (hover > 0.001) {
        const ex = px - cam.eye[0];
        const ey = py - cam.eye[1];
        const ez = pz - cam.eye[2];
        const along = ex * rx + ey * ry + ez * rz;
        const qx = ex - rx * along;
        const qy = ey - ry * along;
        const qz = ez - rz * along;
        const gap = Math.hypot(qx, qy, qz);
        const reach = (0.24 * depthScale) / s.scale;
        const falloff = Math.exp(-(gap * gap) / (reach * reach));
        if (falloff > 0.002 && gap > 1e-5) {
          const nx = qx / gap;
          const ny = qy / gap;
          const nz = qz / gap;
          const sideways = (nx * tx + ny * ty + nz * tz) * 0.7;
          const strength = hover * falloff * 9 * depthScale;
          fx += (nx - tx * sideways) * strength;
          fy += (ny - ty * sideways) * strength;
          fz += (nz - tz * sideways) * strength;
          tiltTarget += hover * falloff * 1.1 * (nx * ax0 + ny * ay0 + nz * az0);
        }
      }
      if (state.hold > 0.001 && shard.joined) {
        const slot = shard.slot;
        const orbit = slot[0] + state.clock * (0.8 / (0.12 + slot[1])) * slot[3];
        const radius = slot[1] / s.scale;
        const gx = state.gatherCenter[0] + Math.cos(orbit) * radius;
        const gy = state.gatherCenter[1] + Math.sin(orbit) * radius * 0.75;
        const gz = state.gatherCenter[2] + Math.sin(orbit) * radius * 0.45 + slot[2] * 0.3;
        shard.gather += (state.hold - shard.gather) * (1 - Math.exp(-dt / 0.3));
        const pull = shard.gather * 30;
        fx += (gx - px) * pull;
        fy += (gy - py) * pull;
        fz += (gz - pz) * pull;
        tiltTarget += shard.gather * 0.6 * Math.sin(orbit);
      }
      else {
        shard.gather += (0 - shard.gather) * (1 - Math.exp(-dt / 0.2));
      }
      if (rings.length) {
        screenOf(px, py, pz, flat);
        for (const ring of rings) {
          const radius = Math.max(0, ring.age - level * 0.07) * 2.3;
          const dxr = flat[0] - ring.x;
          const dyr = flat[1] - ring.y;
          const distance = Math.hypot(dxr, dyr);
          const band = Math.exp(-((distance - radius) * (distance - radius)) / 0.012) * ring.strength;
          if (band > 0.01) {
            shard.flash = Math.max(shard.flash, band * 0.75);
            const outward = Math.max(distance, 0.05);
            const ux = (cam.right[0] * dxr + cam.up[0] * dyr) / outward;
            const uy = (cam.right[1] * dxr + cam.up[1] * dyr) / outward;
            const uz = (cam.right[2] * dxr + cam.up[2] * dyr) / outward;
            tiltTarget += band * 1.4 * (ux * ax0 + uy * ay0 + uz * az0);
            const push = (band * 2.2 * depthScale) / Math.max(distance, 0.05);
            fx += (cam.right[0] * dxr + cam.up[0] * dyr) * push;
            fy += (cam.right[1] * dxr + cam.up[1] * dyr) * push;
            fz += (cam.right[2] * dxr + cam.up[2] * dyr) * push;
          }
        }
      }
      const stiffness = 24 * (1 - shard.gather * 0.95);
      for (let step = 0; step < steps; step += 1) {
        shard.velocity[0] += (fx - stiffness * shard.offset[0] - 7.5 * shard.velocity[0]) * h;
        shard.velocity[1] += (fy - stiffness * shard.offset[1] - 7.5 * shard.velocity[1]) * h;
        shard.velocity[2] += (fz - stiffness * shard.offset[2] - 7.5 * shard.velocity[2]) * h;
        shard.offset[0] += shard.velocity[0] * h;
        shard.offset[1] += shard.velocity[1] * h;
        shard.offset[2] += shard.velocity[2] * h;
        shard.tiltVelocity += (90 * (tiltTarget - shard.tilt) - 15 * shard.tiltVelocity) * h;
        shard.tilt += shard.tiltVelocity * h;
      }
      shard.flash *= Math.exp(-dt / 0.45);
      const ox = hx + shard.offset[0];
      const oy = hy + shard.offset[1];
      const oz = hz + shard.offset[2];
      shard.position[0] = ox;
      shard.position[1] = oy;
      shard.position[2] = oz;
      let vx = cam.eye[0] - ox;
      let vy = cam.eye[1] - oy;
      let vz = cam.eye[2] - oz;
      const vl = Math.hypot(vx, vy, vz) || 1;
      vx /= vl;
      vy /= vl;
      vz /= vl;
      let dx = tx + shard.velocity[0] * 0.05;
      let dy = ty + shard.velocity[1] * 0.05;
      let dz = tz + shard.velocity[2] * 0.05;
      const facingPart = dx * vx + dy * vy + dz * vz;
      dx -= vx * facingPart;
      dy -= vy * facingPart;
      dz -= vz * facingPart;
      let dl = Math.hypot(dx, dy, dz);
      if (dl < 1e-4) {
        dx = cam.right[0];
        dy = cam.right[1];
        dz = cam.right[2];
        dl = 1;
      }
      dx /= dl;
      dy /= dl;
      dz /= dl;
      const wx = vy * dz - vz * dy;
      const wy = vz * dx - vx * dz;
      const wz = vx * dy - vy * dx;
      const yaw = shard.yaw + 0.05 * Math.sin(state.clock * shard.flutter[1] * 0.7 + shard.flutter[0]);
      const cyaw = Math.cos(yaw);
      const syaw = Math.sin(yaw);
      const kx = dx * cyaw + wx * syaw;
      const ky = dy * cyaw + wy * syaw;
      const kz = dz * cyaw + wz * syaw;
      const jx = wx * cyaw - dx * syaw;
      const jy = wy * cyaw - dy * syaw;
      const jz = wz * cyaw - dz * syaw;
      const wave = 0.8 * twistWeight * Math.sin(angle) +
        0.3 * Math.sin(s0 * TAU * 1.6 - state.roll * 0.55 + level * 0.9 + shard.lane * 0.7);
      const flutter = 0.06 * Math.sin(state.clock * shard.flutter[1] + shard.flutter[0]);
      const bank = MAX_BANK * Math.tanh((wave + shard.bank + flutter + shard.tilt + introBank) / MAX_BANK);
      const cb = Math.cos(bank);
      const sb = Math.sin(bank);
      const mx = vx * cb + jx * sb;
      const my = vy * cb + jy * sb;
      const mz = vz * cb + jz * sb;
      const pitch = shard.pitch + 0.2 * Math.sin(s0 * TAU * 1.1 - state.roll * 0.4 + level * 2.1);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const axisX = kx * cp + mx * sp;
      const axisY = ky * cp + my * sp;
      const axisZ = kz * cp + mz * sp;
      const nx = mx * cp - kx * sp;
      const ny = my * cp - ky * sp;
      const nz = mz * cp - kz * sp;
      const ex = ox - cam.eye[0];
      const ey = oy - cam.eye[1];
      const ez = oz - cam.eye[2];
      const viewDepth = ex * cam.forward[0] + ey * cam.forward[1] + ez * cam.forward[2];
      depths[index] = viewDepth;
      const core = 1 - 0.45 * shard.lane * shard.lane;
      const size = 0.062 * s.shardSize * shard.size * GROWTH[level] * appear * Math.sqrt(taper) * core;
      const o = index * FLOATS;
      staging[o] = ox;
      staging[o + 1] = oy;
      staging[o + 2] = oz;
      staging[o + 3] = size > 1e-5 ? size : 0;
      staging[o + 4] = axisX;
      staging[o + 5] = axisY;
      staging[o + 6] = axisZ;
      staging[o + 7] = shard.thickness;
      staging[o + 8] = nx;
      staging[o + 9] = ny;
      staging[o + 10] = nz;
      staging[o + 11] = shard.tint;
      for (let k = 0; k < 10; k += 1)
        staging[o + 12 + k] = shard.shape[k];
      staging[o + 22] = shard.sides;
      staging[o + 23] = shard.flash;
    }
    updateAeroMarkers({ state, paths, markerCounts, markerStarts, resources, container, s, dt, reduced, aspect, introOn, introAge, halfHeight, rings, flat, screenOf, ringBand });
  };
  return simulate;
}
