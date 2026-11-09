import { describe, expect, it, test, vi } from 'vitest';
import {
  alignSelectedNodes,
  autoArrangeCanvasNodes,
  distributeSelectedNodes,
} from './canvasAlignment';
import {
  appendNodeRun,
  connectionError,
  getNodeInputPorts,
  getNodeOutputPorts,
  rollbackNodeRun,
  syncEdgesWithNodeReferences,
} from './canvasGraph';
import { loadCanvasGenerationModels } from './canvasNodeFactory';
import { editTimelineClip, snapTimelineTime, timelineRanges } from './canvasVideoFrame';
import type { CanvasNode, CanvasTimelineClip } from './types';

vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientBaseUrl: (selection: string) => selection === 'metaso-choice' ? 'https://metaso.cn/api' : 'https://api.minimax.cn',
}));
vi.mock('@shared/domain/models/modalityStorage', () => ({
  modalityPickerSelections: () => [
    { id: 'metaso-choice', modelId: 'MiniMax-H3', name: 'H3 · 秘塔' },
    { id: 'official-choice', modelId: 'MiniMax-H3', name: 'H3 · 官方' },
  ],
}));

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

describe('canvas video model routes', () => {
  it('keeps two channels of the same model selectable with their own capabilities', () => {
    const options = loadCanvasGenerationModels(true);
    expect(options.map((item) => item.id)).toEqual(['metaso-choice', 'official-choice']);
    expect(options[0].supportedResolutions).toEqual(['480P', '768P', '1080P', '2K']);
    expect(options[0].supportedDurations?.at(-1)).toBe(15);
    expect(options[1].supportedResolutions).toEqual(['720P', '1080P']);
    expect(options[1].supportedDurations?.at(-1)).toBe(15);
  });
});

test('splits and trims a shared 12-second source without changing the media or timeline minimum', () => {
  const clips: CanvasTimelineClip[] = [{ id:'first', url:'/storage/fixture.mp4', duration:12 }];
  expect(editTimelineClip(clips, 0.8, 'split', 'second')).toBe(clips);
  const split = editTimelineClip(clips, 5, 'split', 'second');
  const incoming = editTimelineClip(split, 7, 'in');
  const outgoing = editTimelineClip(incoming, 7, 'out');
  expect(timelineRanges(outgoing).map(({start,end,offset,finish})=>[start,end,offset,finish]))
    .toEqual([[0,5,0,5],[7,9,5,7]]);
  expect(outgoing.map(clip=>clip.url)).toEqual([clips[0].url,clips[0].url]);
});

test('snaps to the nearest boundary within eight screen pixels only while enabled', () => {
  expect(snapTimelineTime(5.15,[0,5,12],40,true)).toBe(5);
  expect(snapTimelineTime(5.15,[0,5,12],40,false)).toBe(5.15);
  expect(snapTimelineTime(5.25,[0,5,12],40,true)).toBe(5.25);
});

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
    const patches = distributeSelectedNodes([nodeA, nodeB, nodeC], ['a', 'b', 'c'], 'horizontal');
    expect(patches['b']?.x).toBe(450);
  });

  it('auto arranges nodes hierarchically based on referenceNodeIds', () => {
    const inputPrompt: CanvasNode = { ...nodeA, id: 'prompt-1', type: 'prompt' };
    const middleImage: CanvasNode = { ...nodeB, id: 'gen-img-1', type: 'drawing', referenceNodeIds: ['prompt-1'] };
    const finalVideo: CanvasNode = { ...nodeC, id: 'gen-vid-1', type: 'drawing', referenceNodeIds: ['gen-img-1'] };

    const patches = autoArrangeCanvasNodes([inputPrompt, middleImage, finalVideo]);
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
