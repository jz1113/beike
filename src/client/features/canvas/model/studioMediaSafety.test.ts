import { describe, expect, it } from 'vitest';
import { cloneStudioNode, remapStudioNodeReferences } from './studioClipboard';
import { studioOriginalVideo } from './studioOriginalVideo';
import { normalizeStudioPreview } from './studioPreview';
import { recordStudioResultVersion } from './studioVersions';
import type { StudioScene } from './types';

function makeScene(nodes: StudioScene['nodes'], connections: StudioScene['connections'] = []): StudioScene {
  return { nodes, connections, groups: [], textBoxes: [], strokes: [], view: { x: 0, y: 0, zoom: 1 } };
}

describe('canvas media identity', () => {
  it('copies content and redirects node references without duplicating a pending submission', () => {
    const original = {
      id: 'video', type: 'gen-video', content: '/storage/previous.mp4', beikeTaskId: 'receipt',
      beikeTaskRecord: { id: 'receipt' }, isGenerating: true,
      settings: { beikeRequiredInputs: ['source'], _executeTrigger: 1, isGenerating: true },
    };
    const [copy] = remapStudioNodeReferences([cloneStudioNode(original)], [['source', 'source-copy']]);
    expect(copy).toMatchObject({ content: '/storage/previous.mp4', isGenerating: false, settings: { beikeRequiredInputs: ['source-copy'] } });
    expect(copy.beikeTaskRecord).toBeUndefined();
    expect(copy.beikeTaskId).toBeUndefined();
    expect(copy.settings).not.toHaveProperty('_executeTrigger');
    expect(original.settings.beikeRequiredInputs).toEqual(['source']);
  });

  it('uses the explicitly connected raw video for audio and previews, rejecting two possible originals', () => {
    const original = { id: 'old', type: 'input-image', content: '/storage/old.mp4', settings: { mediaType: 'video' } };
    const raw = { id: 'raw', type: 'video-input', content: '/storage/raw.mp4' };
    const output = { id: 'out', type: 'gen-video', settings: { beikeOriginalNodeId: 'old' } };
    const scene = makeScene([original, raw, output], [{ id: 'edge', from: 'raw', to: 'out' }]);
    expect(studioOriginalVideo(scene, 'out')).toMatchObject({ nodeId: 'raw', url: '/storage/raw.mp4' });
    expect(normalizeStudioPreview(scene, { id: 'raw_lightbox', type: 'image', url: 'blob:thumbnail' })).toMatchObject({
      url: '/storage/raw.mp4', type: 'video',
    });
    expect(() => studioOriginalVideo({ ...scene, connections: [...scene.connections, { id: 'second', from: 'old', to: 'out' }] }, 'out')).toThrow('请连接一份原始参考视频');
  });

  it('adds a result version with the submitted task identity and discards a stale asset cache', () => {
    const previous = { id: 'node', type: 'gen-video', content: '/storage/old.mp4', beikeTaskId: 'receipt' };
    const next = { ...previous, content: '/storage/new.mp4', videoUrl: '/storage/new.mp4',
      settings: { _contentAssetId: 'old-cache', videoPosterUrl: '/old.jpg', resolution: '768P' } };
    const versions = [{ id: 'previous', content: '/storage/old.mp4' }];
    const recorded = recordStudioResultVersion(previous, next, versions);
    expect(recorded.settings).not.toHaveProperty('_contentAssetId');
    expect(recorded.settings).not.toHaveProperty('videoPosterUrl');
    expect(recorded.settings).toMatchObject({ activeGenerationVersionIndex: 1, generationVersions: [
      { id: 'previous' }, { id: 'receipt', originalUrl: '/storage/new.mp4', recipe: { settings: { resolution: '768P' } } },
    ] });
    expect(versions).toHaveLength(1);
  });
});
