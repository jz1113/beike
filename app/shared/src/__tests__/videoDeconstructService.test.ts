import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectVideoMetadata,
  extractVideoStoryboards,
  extractVideoSegmentFrames,
} from '../videoDeconstructService';
import fs from 'node:fs';

describe('videoDeconstructService', () => {
  let fixtureDir: string;
  let sampleVideo: string;

  beforeAll(() => {
    fixtureDir = fs.mkdtempSync(join(tmpdir(), 'azhuo-video-fixture-'));
    sampleVideo = join(fixtureDir, 'sample.avi');
    // Use the same Python/OpenCV dependencies as the production service.
    // Missing dependencies fail explicitly instead of silently skipping coverage.
    execFileSync('python3', ['-c', `
import cv2, numpy as np, sys
writer = cv2.VideoWriter(sys.argv[1], cv2.VideoWriter_fourcc(*'MJPG'), 30, (180, 320))
if not writer.isOpened():
    raise RuntimeError('Unable to create video fixture with MJPG codec')
for i in range(120):
    frame = np.full((320, 180, 3), (i * 2) % 256, dtype=np.uint8)
    writer.write(frame)
writer.release()
`, sampleVideo], { timeout: 15_000 });
  });

  afterAll(() => {
    if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('accurately inspects metadata of a generated video', async () => {
    const meta = await inspectVideoMetadata(sampleVideo);
    expect(meta.width).toBe(180);
    expect(meta.height).toBe(320);
    expect(meta.fps).toBe(30);
    expect(meta.duration).toBeCloseTo(4, 1);
    expect(meta.aspectRatio).toBe('9:16');
  });

  it('extracts storyboards contact sheet and keyframe urls', async () => {
    const sb = await extractVideoStoryboards(sampleVideo, { sampleCount: 8, columns: 4 });
    expect(sb.sampleCount).toBe(8);
    expect(sb.contactSheetUrl).toMatch(/^\/storage\/generated\/images\//);
    expect(sb.contactSheetUrl).toContain('storyboard_grid.jpg');
    expect(sb.frameUrls.length).toBe(8);
    expect(sb.dimensions).toBe('180x320');
  });

  it('extracts segment frames for the first 3 seconds', async () => {
    const seg = await extractVideoSegmentFrames(sampleVideo, { startSec: 0, endSec: 3, frameCount: 4 });
    expect(seg.count).toBe(4);
    expect(seg.frameUrls.length).toBe(4);
    expect(seg.timeRange).toBe('0.0s - 3.0s');
  });
});
