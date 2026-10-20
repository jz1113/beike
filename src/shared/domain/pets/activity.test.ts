import { describe, expect, it } from 'vitest';
import { resolvePetPose } from './activity';

describe('pet pose priority', () => {
  it('lets the settings preview and cover feeding override global work', () => {
    expect(resolvePetPose({ preview: 'look', feedPhase: 'analyzing', busy: true })).toBe('look');
    expect(resolvePetPose({ feedPhase: 'uploading', flash: 'success', busy: true })).toBe('working');
    expect(resolvePetPose({ feedPhase: 'error', busy: true })).toBe('failed');
    expect(resolvePetPose({ feedPhase: 'idle', flash: 'success', busy: true })).toBe('success');
    expect(resolvePetPose({ feedPhase: 'ready', busy: true })).toBe('working');
    expect(resolvePetPose({})).toBe('idle');
  });
});
