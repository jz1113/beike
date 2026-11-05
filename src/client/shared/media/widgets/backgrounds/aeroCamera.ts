import type { AeroState } from './aeroState';
import type { AeroResources } from './aeroResources';
import { CAMERA, AeroSettings } from './aeroShardModel';
export function createAeroCamera(state: AeroState, { output }: AeroResources) {
  const cam = { eye: [0, 0, CAMERA], forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0], focal: 1 };
  const updateCamera = (s: AeroSettings) => {
    const cy = Math.cos(state.yaw);
    const sy = Math.sin(state.yaw);
    const cp = Math.cos(state.pitch);
    const sp = Math.sin(state.pitch);
    cam.eye[0] = sy * cp * CAMERA;
    cam.eye[1] = sp * CAMERA;
    cam.eye[2] = cy * cp * CAMERA;
    cam.forward[0] = -sy * cp;
    cam.forward[1] = -sp;
    cam.forward[2] = -cy * cp;
    const rl = Math.hypot(cam.forward[2], cam.forward[0]) || 1;
    cam.right[0] = -cam.forward[2] / rl;
    cam.right[1] = 0;
    cam.right[2] = cam.forward[0] / rl;
    cam.up[0] = cam.right[1] * cam.forward[2] - cam.right[2] * cam.forward[1];
    cam.up[1] = cam.right[2] * cam.forward[0] - cam.right[0] * cam.forward[2];
    cam.up[2] = cam.right[0] * cam.forward[1] - cam.right[1] * cam.forward[0];
    cam.focal = output.size[1] * 0.5 * CAMERA * s.scale;
  };
  const ray = [0, 0, 1];
  const rayAt = (px: number, py: number) => {
    const x = (px - 0.5) * output.size[0];
    const y = (0.5 - py) * output.size[1];
    ray[0] = cam.forward[0] * cam.focal + cam.right[0] * x + cam.up[0] * y;
    ray[1] = cam.forward[1] * cam.focal + cam.right[1] * x + cam.up[1] * y;
    ray[2] = cam.forward[2] * cam.focal + cam.right[2] * x + cam.up[2] * y;
    const length = Math.hypot(ray[0], ray[1], ray[2]) || 1;
    ray[0] /= length;
    ray[1] /= length;
    ray[2] /= length;
    return ray;
  };
  return { cam, updateCamera, ray, rayAt };
}
export type AeroCamera = ReturnType<typeof createAeroCamera>;
