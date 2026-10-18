import { describe, expect, it } from 'vitest';
import { defaultVideoResolution, getVideoModelById, resolveVideoResolution } from './video';

describe('default video resolution', () => {
  it('uses 480P when the model supports it', () => {
    expect(defaultVideoResolution(['480P', '720P', '1080P'])).toBe('480P');
    expect(defaultVideoResolution(getVideoModelById('doubao-seedance-2.0-mini')?.supportedResolutions)).toBe('480P');
    expect(defaultVideoResolution(getVideoModelById('wan3.0-video')?.supportedResolutions)).toBe('480P');
  });

  it('drops 480P and uses 720P when that is the lowest supported tier', () => {
    expect(defaultVideoResolution(['720P', '1080P', '4K'])).toBe('720P');
    expect(resolveVideoResolution('480P', ['720P', '1080P'])).toBe('720P');
    expect(defaultVideoResolution(getVideoModelById('kling-video-v3')?.supportedResolutions)).toBe('720P');
    expect(defaultVideoResolution(getVideoModelById('veo3.1')?.supportedResolutions)).toBe('720P');
    expect(defaultVideoResolution(getVideoModelById('MiniMax-H3')?.supportedResolutions)).toBe('720P');
  });

  it('uses the lowest listed tier when neither 480P nor 720P exists', () => {
    expect(defaultVideoResolution(['4K', '1080P'])).toBe('1080P');
    expect(resolveVideoResolution('480P', ['1080P', '4K'])).toBe('1080P');
  });

  it('keeps a selected tier the model still supports', () => {
    expect(resolveVideoResolution('1080P', ['480P', '720P', '1080P'])).toBe('1080P');
    expect(resolveVideoResolution('4K', ['720P', '1080P', '4K'])).toBe('4K');
    expect(resolveVideoResolution('4K', ['480P', '720P'])).toBe('480P');
  });
});
