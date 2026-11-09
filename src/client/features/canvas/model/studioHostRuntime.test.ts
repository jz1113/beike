import { describe, expect, it } from 'vitest';
import type { studioChannels } from './studioGeneration';
import type { StudioScene } from './types';
import {
  applyStudioTaskResult,
  normalizeStudioNode,
  recoverLoadedStudioScene,
  reconcileStudioReferenceChanges,
  remapStudioPromptReferences,
  resolveStableStudioReference,
  selectStudioModelFor,
} from './studioHostRuntime';

type StudioNode = StudioScene['nodes'][number];

const mockChannels: ReturnType<typeof studioChannels> = [
  {
    id: 'img-1',
    name: 'NanoBanana Pro',
    kind: 'image',
    route: 'img-route',
    modelId: 'nanobanana-pro',
    metasoH3: false,
    preferred: true,
  },
  {
    id: 'vid-1',
    name: 'Sora 2',
    kind: 'video',
    route: 'vid-route',
    modelId: 'sora-2',
    metasoH3: false,
    preferred: true,
  },
  {
    id: 'chat-1',
    name: 'Gemini Pro',
    kind: 'chat',
    route: 'chat-route',
    modelId: 'gemini-2.5-pro',
    preferred: true,
  },
];

describe('studioHostRuntime', () => {
  it('selects matching model or falls back by kind', () => {
    expect(selectStudioModelFor('gen-image', 'NanoBanana Pro', mockChannels)).toBe('img-1');
    expect(selectStudioModelFor('gen-video', 'unknown-model', mockChannels)).toBe('vid-1');
  });

  it('normalizes studio nodes with channel model and recovers depth-video', () => {
    const raw: StudioNode = {
      id: 'n-1',
      type: 'gen-image',
      x: 100,
      y: 200,
      width: 360,
      height: 460,
      errorMsg: '请先配置 API Key',
      settings: { model: 'old-model' },
    };
    const normalized = normalizeStudioNode(raw, mockChannels);
    expect((normalized.settings as Record<string, unknown>)?.model).toBe('img-1');
    expect(normalized.errorMsg).toBeUndefined();

    const depthNode = normalizeStudioNode(
      {
        id: 'n-2',
        type: 'gen-video',
        x: 0,
        y: 0,
        settings: { beikeOperation: 'depth-video' },
      },
      mockChannels,
    );
    expect((depthNode.settings as Record<string, unknown>)?.model).toBe('beike:depth:video');
  });

  it('remaps prompt @图片N references and reconciles reference order changes', () => {
    const before = [
      { nodeId: 'img-a', mediaType: 'image', position1Based: 1 },
      { nodeId: 'img-b', mediaType: 'image', position1Based: 2 },
    ];
    const after = [
      { nodeId: 'img-b', mediaType: 'image', position1Based: 1 },
      { nodeId: 'img-a', mediaType: 'image', position1Based: 2 },
    ];
    const remapped = remapStudioPromptReferences('Use @图片1 with style of @图片2', before, after);
    expect(remapped).toBe('Use @图片2 with style of @图片1');

    const prevScene: StudioScene = {
      nodes: [
        { id: 'img-a', type: 'input-image', x: 0, y: 0, content: 'https://example.com/a.png' },
        { id: 'img-b', type: 'input-image', x: 0, y: 300, content: 'https://example.com/b.png' },
        {
          id: 'gen-1',
          type: 'gen-image',
          x: 400,
          y: 0,
          prompt: 'Combine @图片1 and @图片2',
        },
      ],
      connections: [
        { id: 'c1', from: 'img-a', to: 'gen-1' },
        { id: 'c2', from: 'img-b', to: 'gen-1' },
      ],
      groups: [],
      strokes: [],
      textBoxes: [],
      view: { x: 0, y: 0, zoom: 1 },
    };

    const nextScene: StudioScene = {
      ...prevScene,
      connections: [
        { id: 'c2', from: 'img-b', to: 'gen-1' },
        { id: 'c1', from: 'img-a', to: 'gen-1' },
      ],
    };

    const reconciled = reconcileStudioReferenceChanges(prevScene, nextScene);
    const genNode = reconciled.nodes.find((n) => n.id === 'gen-1');
    expect(genNode?.prompt).toBe('Combine @图片2 and @图片1');
  });

  it('recovers interrupted generating nodes and applies task completion results', async () => {
    const scene: StudioScene = {
      nodes: [
        {
          id: 'gen-1',
          type: 'gen-image',
          x: 0,
          y: 0,
          isGenerating: true,
          beikePromptReviewPending: true,
          prompt: 'Test prompt',
        },
        {
          id: 'preview-1',
          type: 'preview',
          x: 500,
          y: 0,
        },
      ],
      connections: [{ id: 'c1', from: 'gen-1', to: 'preview-1' }],
      groups: [],
      strokes: [],
      textBoxes: [],
      view: { x: 0, y: 0, zoom: 1 },
    };

    const recovered = recoverLoadedStudioScene('proj-1', scene, mockChannels);
    expect(recovered.nodes[0].isGenerating).toBeFalsy();

    const completedNode = applyStudioTaskResult(
      { ...scene.nodes[0], beikeTaskId: 'task-1' },
      'task-1',
      'https://example.com/out.png',
    );
    expect(completedNode.isGenerating).toBe(false);
    expect(completedNode.imageUrl).toBe('https://example.com/out.png');
    const settings = completedNode.settings as Record<string, unknown>;
    expect(Array.isArray(settings.generationVersions)).toBe(true);

    const stableRef = await resolveStableStudioReference(
      { url: 'https://example.com/out.png', type: 'image' },
      undefined,
      'https://example.com',
    );
    expect(stableRef).toEqual({ type: 'image', url: 'https://example.com/out.png' });
  });
});
