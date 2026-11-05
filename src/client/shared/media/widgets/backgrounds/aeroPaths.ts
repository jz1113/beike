import type { AeroState } from './aeroState';
import { SAMPLES, LEVELS, clamp, ribbonPoint } from './aeroShardModel';
export function createAeroPaths(state: AeroState) {
  const paths = Array.from({ length: LEVELS }, () => ({
    position: new Float32Array(SAMPLES * 3),
    tangent: new Float32Array(SAMPLES * 3),
    across: new Float32Array(SAMPLES * 3),
    lift: new Float32Array(SAMPLES * 3),
    length: 1
  }));
  const markerCounts = [0, 0, 0, 0, 0];
  const markerStarts = [0, 0, 0, 0, 0];
  const raw = new Float32Array((SAMPLES + 1) * 3);
  const lengths = new Float32Array(SAMPLES + 1);
  const point = [0, 0, 0];
  let pathKey = '';
  const buildPaths = (aspect: number) => {
    const closed = state.weights[3] > 0.999;
    const key = `${aspect.toFixed(4)}|${state.weights.map(w => w.toFixed(4)).join(',')}`;
    if (key === pathKey)
      return closed;
    pathKey = key;
    for (let level = 0; level < LEVELS; level += 1) {
      const path = paths[level];
      let total = 0;
      for (let i = 0; i <= SAMPLES; i += 1) {
        const s = i / SAMPLES;
        let x = 0;
        let y = 0;
        let z = 0;
        for (let k = 0; k < 4; k += 1) {
          const weight = state.weights[k];
          if (weight < 0.0001)
            continue;
          ribbonPoint(k, level, s, aspect, point);
          x += point[0] * weight;
          y += point[1] * weight;
          z += point[2] * weight;
        }
        raw[i * 3] = x;
        raw[i * 3 + 1] = y;
        raw[i * 3 + 2] = z;
        if (i > 0)
          total += Math.hypot(x - raw[i * 3 - 3], y - raw[i * 3 - 2], z - raw[i * 3 - 1]);
        lengths[i] = total;
      }
      path.length = Math.max(total, 1e-3);
      let cursor = 0;
      for (let i = 0; i < SAMPLES; i += 1) {
        const want = (i / (SAMPLES - 1)) * total;
        while (cursor < SAMPLES - 1 && lengths[cursor + 1] < want)
          cursor += 1;
        const span = Math.max(lengths[cursor + 1] - lengths[cursor], 1e-6);
        const f = clamp((want - lengths[cursor]) / span, 0, 1);
        for (let c = 0; c < 3; c += 1) {
          path.position[i * 3 + c] = raw[cursor * 3 + c] + (raw[cursor * 3 + 3 + c] - raw[cursor * 3 + c]) * f;
        }
      }
      let px = 0;
      let py = 1;
      let pz = 0;
      for (let i = 0; i < SAMPLES; i += 1) {
        const a = Math.max(0, i - 1);
        const b = Math.min(SAMPLES - 1, i + 1);
        let tx = path.position[b * 3] - path.position[a * 3];
        let ty = path.position[b * 3 + 1] - path.position[a * 3 + 1];
        let tz = path.position[b * 3 + 2] - path.position[a * 3 + 2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        if (i === 0) {
          px = -ty;
          py = tx;
          pz = 0;
        }
        const along = px * tx + py * ty + pz * tz;
        px -= tx * along;
        py -= ty * along;
        pz -= tz * along;
        const pl = Math.hypot(px, py, pz) || 1;
        px /= pl;
        py /= pl;
        pz /= pl;
        path.tangent[i * 3] = tx;
        path.tangent[i * 3 + 1] = ty;
        path.tangent[i * 3 + 2] = tz;
        path.across[i * 3] = px;
        path.across[i * 3 + 1] = py;
        path.across[i * 3 + 2] = pz;
        path.lift[i * 3] = ty * pz - tz * py;
        path.lift[i * 3 + 1] = tz * px - tx * pz;
        path.lift[i * 3 + 2] = tx * py - ty * px;
      }
    }
    return closed;
  };
  return { paths, markerCounts, markerStarts, buildPaths };
}
export type AeroPaths = ReturnType<typeof createAeroPaths>;
