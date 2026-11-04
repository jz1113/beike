import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, it } from 'vitest';

const python = process.env.DEPTH_VIDEO_PYTHON?.trim() || 'python3';
const directory = path.resolve(import.meta.dirname);
const available = spawnSync(python, ['-c', 'import cv2, numpy, scipy, PIL'], { encoding: 'utf8' }).status === 0;

it.skipIf(!available)('keeps equal-depth floor black, body gradients visible and empty frames black', () => {
  const result = spawnSync(python, ['-c', `
import numpy as np
from depth_runtime import PostProcessConfig
from depth_processing import apply_style, render_subject_depth, restore_depth_regions, trim_depth_spill
near = np.tile(np.linspace(0, 1, 80, dtype=np.float32), (100, 1))
mask = np.zeros_like(near)
mask[10:90, 20:60] = 1
cfg = PostProcessConfig(sharpen=True)
out = render_subject_depth(near, mask, cfg)
assert np.all(out[mask == 0] == 0), 'background acquired sharpening halos'
assert 3 < np.ptp(out[mask == 1]) < 45, 'body should retain subtle depth'
assert out[mask == 1].min() >= 210, 'motion silhouette became dark'
assert out.max() < 255, 'body clipped to white'
assert np.all(render_subject_depth(near, np.zeros_like(mask), cfg) == 0)
flat = render_subject_depth(np.ones_like(near), mask, cfg)
assert np.isfinite(flat).all() and flat[mask == 1].min() > 0
for style in ['raw', 'turbo']:
    assert np.array_equal(apply_style(near, style), apply_style(near, style, subject_mask=mask))
motion = apply_style(near, 'mocap', subject_mask=mask)
assert np.all(motion[mask == 0] == 0)
scene = np.zeros_like(near)
scene[10:90, 20:60] = 0.85
spill = mask.copy()
spill[50, 60:75] = 1
clean = trim_depth_spill(scene, spill)
assert clean[50, 65] < 0.5 and clean[50, 40] == 1
assert np.array_equal(trim_depth_spill(np.ones_like(near), mask), mask)
# The person mask misses a torso patch open on the right. A nearby arm gap
# and a disconnected object have background or unrelated depth evidence.
body = np.zeros((100, 120), np.float32)
body[10:95, 30:80] = 0.8
body[25:40, 62:80] = 0
partial = (body > 0).astype(np.float32)
partial[48:72, 45:80] = 0
body[48:72, 83:86] = 0.8
fixed = restore_depth_regions(body, partial)
assert fixed[60, 65] == 1 and fixed[30, 70] == 0 and fixed[60, 84] == 0
assert not restore_depth_regions(body, np.zeros_like(body)).any()

`], { cwd: directory, encoding: 'utf8' });
  expect(result.stderr, result.stdout).toBe('');
  expect(result.status, result.stderr).toBe(0);
});
