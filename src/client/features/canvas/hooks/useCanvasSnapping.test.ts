import { describe, expect, it } from 'vitest';
import { computeSnapGuides } from './useCanvasSnapping';
import type { CanvasNode } from '../model/types';

describe('useCanvasSnapping tests', () => {
  const staticNode: CanvasNode = {
    id: 'static-1',
    type: 'image',
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    createdAt: Date.now(),
  };

  const movingNode: CanvasNode = {
    id: 'moving-1',
    type: 'image',
    x: 350,
    y: 98, // Very close to y=100 (diff=2)
    width: 200,
    height: 200,
    createdAt: Date.now(),
  };

  it('snaps vertical alignment when close to neighbor boundary', () => {
    const result = computeSnapGuides([movingNode], [staticNode, movingNode], 0, 0, 1.0, 5);
    // Should snap dy by 2 to align top edges at y=100
    expect(result.dy).toBe(2);
    expect(result.guides.some(g => g.type === 'horizontal')).toBe(true);
  });

  it('does not snap if outside threshold', () => {
    const result = computeSnapGuides([movingNode], [staticNode, movingNode], 0, 40, 1.0, 5);
    expect(result.dy).toBe(40);
  });
});
