import { describe, expect, it } from 'vitest';
import {
  alignSelectedNodes,
  distributeSelectedNodes,
  autoArrangeCanvasNodes,
} from './canvasAlignment';
import type { CanvasNode } from './types';

describe('canvasAlignment tests', () => {
  const nodeA: CanvasNode = {
    id: 'a',
    type: 'image',
    x: 100,
    y: 50,
    width: 200,
    height: 150,
    createdAt: Date.now(),
  };

  const nodeB: CanvasNode = {
    id: 'b',
    type: 'image',
    x: 400,
    y: 120,
    width: 200,
    height: 150,
    createdAt: Date.now(),
  };

  const nodeC: CanvasNode = {
    id: 'c',
    type: 'image',
    x: 800,
    y: 200,
    width: 200,
    height: 150,
    createdAt: Date.now(),
  };

  it('aligns nodes to left correctly', () => {
    const patches = alignSelectedNodes([nodeA, nodeB, nodeC], ['a', 'b', 'c'], 'left');
    expect(patches['b']?.x).toBe(100);
    expect(patches['c']?.x).toBe(100);
    expect(patches['a']).toBeUndefined(); // already at minX 100
  });

  it('aligns nodes to top correctly', () => {
    const patches = alignSelectedNodes([nodeA, nodeB], ['a', 'b'], 'top');
    expect(patches['b']?.y).toBe(50);
  });

  it('distributes nodes horizontally with equal spacing', () => {
    // nodeA: x=100, w=200 -> right=300
    // nodeB: x=400, w=200
    // nodeC: x=800, w=200 -> right=1000
    // total span = 900, sum of widths = 600, gap = (900-600)/2 = 150
    // target x for B = 100 + 200 + 150 = 450
    const patches = distributeSelectedNodes([nodeA, nodeB, nodeC], ['a', 'b', 'c'], 'horizontal');
    expect(patches['b']?.x).toBe(450);
  });

  it('auto arranges nodes hierarchically based on referenceNodeIds', () => {
    const inputPrompt: CanvasNode = { ...nodeA, id: 'prompt-1', type: 'prompt' };
    const middleImage: CanvasNode = { ...nodeB, id: 'gen-img-1', type: 'drawing', referenceNodeIds: ['prompt-1'] };
    const finalVideo: CanvasNode = { ...nodeC, id: 'gen-vid-1', type: 'drawing', referenceNodeIds: ['gen-img-1'] };

    const patches = autoArrangeCanvasNodes([inputPrompt, middleImage, finalVideo]);
    // Rank 0 (prompt-1) should be at startX
    // Rank 1 (gen-img-1) should be to the right of prompt-1
    // Rank 2 (gen-vid-1) should be to the right of gen-img-1
    const x0 = patches['prompt-1']?.x ?? inputPrompt.x;
    const x1 = patches['gen-img-1']?.x ?? middleImage.x;
    const x2 = patches['gen-vid-1']?.x ?? finalVideo.x;

    expect(x1).toBeGreaterThan(x0);
    expect(x2).toBeGreaterThan(x1);
  });

  it('returns when edges contain a cycle', () => {
    const patches = autoArrangeCanvasNodes([nodeA, nodeB], [
      { id: 'e1', sourceNodeId: 'a', targetNodeId: 'b', createdAt: 1 },
      { id: 'e2', sourceNodeId: 'b', targetNodeId: 'a', createdAt: 1 },
    ]);
    expect(patches.a?.x).toBeTypeOf('number');
    expect(patches.b?.x).toBeTypeOf('number');
  });
});
