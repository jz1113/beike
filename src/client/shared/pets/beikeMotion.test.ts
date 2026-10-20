import { describe, expect, it } from 'vitest';
import { beikePetMotion, type BeikePetPhase } from './beikeMotion';

const phases: BeikePetPhase[] = ['idle', 'ready', 'dragging', 'uploading', 'analyzing', 'success', 'partial', 'error'];
const tracks = ['body', 'ears', 'eyes', 'gaze', 'mouthMotion', 'feedback'] as const;

describe('beike pet motion', () => {
  it.each(phases)('provides visible body movement and a bounded one-shot feedback for %s', (phase) => {
    const motion = beikePetMotion(phase);
    expect(motion.badge).toBeTruthy();
    expect(motion.mouth).toMatch(/^M/);
    expect(motion.body.transition.repeat).toBe(Infinity);
    expect(motion.body.transition.duration).toBeLessThanOrEqual(3);
    expect(Array.isArray(motion.body.y)).toBe(true);
    expect(motion.feedback.transition.repeat).toBe(0);
    expect(motion.feedback.transition.duration).toBeLessThanOrEqual(1.1);
  });

  it.each(phases)('disables every motion track without losing the expression for %s', (phase) => {
    const motion = beikePetMotion(phase, true);
    const active = beikePetMotion(phase);
    expect(motion.badge).toBe(active.badge);
    expect(motion.mouth).toBe(active.mouth);
    expect(motion.eyeHeight).toBe(active.eyeHeight);
    for (const key of tracks) {
      expect(motion[key]).toEqual({ x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, transition: { duration: 0, repeat: 0, ease: 'easeInOut' } });
    }
  });

  it('distinguishes upload chewing, analysis and terminal expressions', () => {
    const upload = beikePetMotion('uploading');
    const thinking = beikePetMotion('analyzing');
    expect(upload.mouthMotion.transition.repeat).toBe(Infinity);
    expect(upload.mouthMotion.scaleY).toEqual([1, 0.45, 1]);
    expect(thinking.body.rotate).toEqual([-4, 4, -4]);
    expect(thinking.eyeHeight).toBe(4);
    expect(beikePetMotion('success').badge).toBe('饱啦');
    expect(beikePetMotion('partial').badge).toBe('待核对');
    expect(beikePetMotion('error').mouth).not.toBe(upload.mouth);
  });

  it.each(['success', 'partial', 'error'] as const)('ends %s feedback at rest while keeping gentle idle movement', (phase) => {
    const motion = beikePetMotion(phase);
    for (const key of ['x', 'y', 'rotate'] as const) {
      const values = motion.feedback[key];
      if (Array.isArray(values)) expect(values.at(-1)).toBe(0);
    }
    expect(motion.body).toEqual(beikePetMotion('idle').body);
  });

  it('closes the whole eye briefly, with a long open interval', () => {
    expect(beikePetMotion('idle').eyes.scaleY).toEqual([1, 1, 0.08, 1, 1]);
    expect(beikePetMotion('idle').eyes.transition.times).toEqual([0, 0.8, 0.84, 0.88, 1]);
  });
});
