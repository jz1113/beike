import { describe, expect, it } from 'vitest';
import { classifyAvatarDriver, isAvatarDriverModel } from './avatarDrivers';

describe('avatar drivers', () => {
  it('keeps lip-sync models and rejects generic video models', () => {
    expect(classifyAvatarDriver('kling-lip-sync')?.family).toBe('kling');
    expect(classifyAvatarDriver('omnihuman-1.5')?.input).toBe('image');
    expect(classifyAvatarDriver('wanx-avatar-v2')?.family).toBe('wanx');
    expect(isAvatarDriverModel('doubao-seedance-2.5')).toBe(false);
    expect(isAvatarDriverModel('hedra-character')).toBe(true);
  });
});
