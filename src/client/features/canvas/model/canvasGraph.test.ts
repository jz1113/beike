import { describe, expect, it } from 'vitest';
import {
  getNodeOutputPorts,
  getNodeInputPorts,
  syncEdgesWithNodeReferences,
  appendNodeRun,
  rollbackNodeRun,
  connectionError,
} from './canvasGraph';
import type { CanvasNode } from './types';

describe('canvasGraph model tests', () => {
  const baseNode: CanvasNode = {
    id: 'node-1',
    type: 'image',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    imageUrl: 'https://example.com/test.png',
    createdAt: Date.now(),
  };

  it('correctly provides output and input ports for nodes', () => {
    const promptNode: CanvasNode = {
      ...baseNode,
      id: 'p-1',
      type: 'prompt',
      content: 'a cinematic cat',
    };
    const outPorts = getNodeOutputPorts(promptNode);
    expect(outPorts.length).toBe(1);
    expect(outPorts[0].type).toBe('prompt');

    const drawingNode: CanvasNode = {
      ...baseNode,
      id: 'd-1',
      type: 'drawing',
      generationKind: 'video',
    };
    const inPorts = getNodeInputPorts(drawingNode);
    expect(inPorts.some(p => p.id === 'input-first-frame')).toBe(true);
    expect(inPorts.some(p => p.id === 'input-video-ref')).toBe(true);
  });

  it('syncs edges with node referenceNodeIds', () => {
    const sourceNode: CanvasNode = { ...baseNode, id: 'src-1' };
    const targetNode: CanvasNode = {
      ...baseNode,
      id: 'tgt-1',
      type: 'drawing',
      referenceNodeIds: ['src-1'],
    };

    const edges = syncEdgesWithNodeReferences([sourceNode, targetNode]);
    expect(edges.length).toBe(1);
    expect(edges[0].sourceNodeId).toBe('src-1');
    expect(edges[0].targetNodeId).toBe('tgt-1');
  });

  it('manages node execution runs history correctly', () => {
    const node: CanvasNode = { ...baseNode };
    const patch1 = appendNodeRun(node, {
      imageUrl: 'https://example.com/v1.png',
      prompt: 'v1 prompt',
      status: 'success',
    });

    const updatedNode: CanvasNode = { ...node, ...patch1 };
    expect(updatedNode.runs?.length).toBe(1);
    expect(updatedNode.activeRunIndex).toBe(0);
    expect(updatedNode.imageUrl).toBe('https://example.com/v1.png');

    const patch2 = appendNodeRun(updatedNode, {
      imageUrl: 'https://example.com/v2.png',
      prompt: 'v2 prompt',
      status: 'success',
    });

    const secondNode: CanvasNode = { ...updatedNode, ...patch2 };
    expect(secondNode.runs?.length).toBe(2);
    expect(secondNode.imageUrl).toBe('https://example.com/v2.png');

    // Rollback to previous version
    const rollbackPatch = rollbackNodeRun(secondNode, 1);
    expect(rollbackPatch).not.toBeNull();
    expect(rollbackPatch?.imageUrl).toBe('https://example.com/v1.png');
    expect(rollbackPatch?.activeRunIndex).toBe(1);
  });

  it('detects cyclic dependencies and self-connections', () => {
    const n1: CanvasNode = { ...baseNode, id: 'n1', type: 'drawing' };
    const n2: CanvasNode = { ...baseNode, id: 'n2', type: 'drawing', referenceNodeIds: ['n1'] };

    expect(connectionError([n1, n2], 'n1', 'n1')).toContain('自身');
    expect(connectionError([n1, n2], 'n2', 'n1')).toContain('循环');
  });

  it('detects a cycle that only exists in edges', () => {
    const source: CanvasNode = { ...baseNode, id: 'src', type: 'drawing' };
    const target: CanvasNode = { ...baseNode, id: 'cmp', type: 'compare' };
    expect(connectionError([source, target], 'src', 'cmp', [
      { sourceNodeId: 'cmp', targetNodeId: 'src' },
    ])).toContain('循环');
  });
});
