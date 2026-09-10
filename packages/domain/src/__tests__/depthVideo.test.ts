import { describe, expect, it } from 'vitest';
import {
  DEPTH_MODEL_SETUP_COMMAND,
  DEPTH_QUALITY_PROFILES,
  DEPTH_VIDEO_LIMITS,
  formatDepthVideoProgress,
  getDepthQualityProfile,
  isDepthGenMode,
  isDepthQuality,
  isDepthVideoStyle,
  resolveDepthQuality,
  resolveDepthVideoStyle,
} from '../depthVideo';

describe('depthVideo', () => {
  it('validates style', () => {
    expect(isDepthVideoStyle('mocap')).toBe(true);
    expect(isDepthVideoStyle('turbo')).toBe(true);
    expect(isDepthVideoStyle('gray')).toBe(false);
  });

  it('resolves style from legacy colormap', () => {
    expect(resolveDepthVideoStyle({ style: 'raw' })).toBe('raw');
    expect(resolveDepthVideoStyle({ colormap: 'turbo' })).toBe('turbo');
    expect(resolveDepthVideoStyle({ colormap: 'gray' })).toBe('mocap');
    expect(resolveDepthVideoStyle({})).toBe('mocap');
  });

  it('validates and resolves depth quality', () => {
    expect(isDepthQuality('fast')).toBe(true);
    expect(isDepthQuality('standard')).toBe(true);
    expect(isDepthQuality('high')).toBe(true);
    expect(isDepthQuality('mocap')).toBe(false);
    expect(resolveDepthQuality('high')).toBe('high');
    expect(resolveDepthQuality('invalid')).toBe('standard');
    expect(resolveDepthQuality(undefined)).toBe('standard');
  });

  it('maps quality profiles to model and encoding settings', () => {
    expect(DEPTH_QUALITY_PROFILES.fast.modelId).toContain('Small');
    expect(DEPTH_QUALITY_PROFILES.standard.modelId).toContain('Base');
    expect(DEPTH_QUALITY_PROFILES.standard.inferenceSizePx).toBe(518);
    expect(DEPTH_QUALITY_PROFILES.high.modelId).toContain('Large');
    expect(DEPTH_QUALITY_PROFILES.high.inferenceSizePxCuda).toBe(1024);
    expect(DEPTH_QUALITY_PROFILES.high.inferenceSizePxMps).toBe(768);
    expect(DEPTH_QUALITY_PROFILES.high.maxWidthPx).toBe(2560);
    expect(DEPTH_QUALITY_PROFILES.high.postProcess.bilateralD).toBe(0);
    expect(DEPTH_QUALITY_PROFILES.high.postProcess.gamma).toBe(0.78);
    expect(DEPTH_QUALITY_PROFILES.high.postProcess.sharpen).toBe(true);
    expect(getDepthQualityProfile('high').videoCrf).toBe(15);
    expect(getDepthQualityProfile('high').videoPreset).toBe('slow');
  });

  it('formats progress within bounds', () => {
    expect(formatDepthVideoProgress(0, 100)).toBe('5%');
    expect(formatDepthVideoProgress(50, 100)).toBe('50%');
    expect(formatDepthVideoProgress(100, 100)).toBe('95%');
  });

  it('exposes sane limits and setup command', () => {
    expect(DEPTH_VIDEO_LIMITS.maxDurationSec).toBeGreaterThan(0);
    expect(DEPTH_MODEL_SETUP_COMMAND).toContain('setup:depth-model');
  });

  it('detects depth generation modes', () => {
    expect(isDepthGenMode('depth-image')).toBe(true);
    expect(isDepthGenMode('depth-video')).toBe(true);
    expect(isDepthGenMode('image')).toBe(false);
    expect(isDepthGenMode('video')).toBe(false);
  });
});
