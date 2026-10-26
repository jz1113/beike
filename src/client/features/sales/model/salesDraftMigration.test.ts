import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSalesStudioState, readSalesStudioDraft, SALES_STUDIO_STORAGE_KEY, writeSalesStudioDraft } from './salesStudioDraft';

afterEach(() => vi.unstubAllGlobals());

function savedDraft(version = 2) {
  return {
    ...structuredClone(defaultSalesStudioState), draftVersion: version, productName: '旧上衣',
    fashionRefs: { personUrl: '/uploaded-person.jpg', faceUrl: '/uploaded-face.jpg', sceneUrl: '/uploaded-scene.jpg' },
    imageCatalog: [{ index: 7, role: 'main', url: '/original.jpg' }], composedResultUrl: '/old-final.mp4',
    scripts: [{ id: 'old', title: '历史方案', workflowVersion: 3, totalDuration: 15,
      personImagePrompt: '旧人物提示', personFrameUrl: '/person.jpg', sceneImagePrompt: '旧场景提示', sceneFrameUrl: '/scene.jpg',
      fullPrompt: '旧整段提示', finalizedRevision: 'old-final', assetValidation: 'passed',
      renderTaskId: 'paid-video', renderStatus: 'generating', renderResultUrl: '/saved-video.mp4',
      assets: [{ id: 'person', kind: 'person', label: '人物', prompt: '旧上身图', required: true, usesProduct: true,
        url: '/existing.jpg', status: 'generating', taskId: 'paid-image', modelId: 'original-image-model' }],
      shots: [{ shotId: 1, duration: 15, description: '旧展示', voiceover: '看看旧上衣', camera: '中景',
        visualSource: 'avatar_presenter', transition: 'fade', status: 'generating', taskId: 'paid-shot', assetUrl: '/clip.mp4',
        imagePrompt: '旧静帧提示', referenceFrameUrl: '/frame.jpg', motion: 'zoom_in', textOverlay: { text: '旧字幕' },
        characterId: 'avatar', avatarVoiceId: 'voice', audioUrl: '/voice.mp3' }],
    }],
  };
}

function storageFor(value: unknown, key = SALES_STUDIO_STORAGE_KEY) {
  const storage = new Map([[key, JSON.stringify(value)]]);
  vi.stubGlobal('window', { localStorage: {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, encoded: string) => storage.set(name, encoded),
  } });
  return storage;
}

describe('retired sales draft migration', () => {
  it('archives v2 inputs while preserving original images, videos and paid receipts across repeated reopening', () => {
    const original = savedDraft();
    const storage = storageFor(original, 'beike.video_sales.draft.v2');
    const migrated = readSalesStudioDraft();
    expect(migrated).toMatchObject({ draftVersion: 3, composedResultUrl: '/old-final.mp4', imageCatalog: original.imageCatalog,
      historicalData: { fashionRefs: original.fashionRefs } });
    expect(migrated).not.toHaveProperty('fashionRefs');
    const script = migrated.scripts[0];
    expect(script).toMatchObject({ planStale: true, fullPrompt: '旧整段提示', assetValidation: 'pending',
      renderTaskId: 'paid-video', renderStatus: 'generating', renderResultUrl: '/saved-video.mp4',
      historicalData: { personImagePrompt: '旧人物提示', personFrameUrl: '/person.jpg', sceneFrameUrl: '/scene.jpg' },
      assets: [{ taskId: 'paid-image', status: 'uncertain', url: '/existing.jpg', modelId: 'original-image-model' }],
      shots: [{ taskId: 'paid-shot', status: 'generating', assetUrl: '/clip.mp4', transition: 'direct_concat', visualSource: 'ai_generate',
        historicalData: { imagePrompt: '旧静帧提示', referenceFrameUrl: '/frame.jpg', transition: 'fade', visualSource: 'avatar_presenter', audioUrl: '/voice.mp3' } }],
    });
    expect(script).not.toHaveProperty('personFrameUrl');
    expect(script.shots[0]).not.toHaveProperty('characterId');
    expect(script.finalizedRevision).toBeUndefined();
    writeSalesStudioDraft(migrated);
    expect(readSalesStudioDraft()).toEqual(migrated);
    expect(JSON.parse(storage.get('beike.video_sales.draft.v2')!)).toEqual(original);
  });

  it('keeps old image task receipts in history instead of querying them as video tasks', () => {
    const saved = savedDraft();
    saved.scripts[0].shots[0].status = 'redrawing';
    saved.scripts[0].shots[0].taskId = 'old-image-task';
    storageFor(saved);
    const shot = readSalesStudioDraft().scripts[0].shots[0];
    expect(shot).toMatchObject({ status: 'pending', historicalData: { status: 'redrawing', taskId: 'old-image-task' } });
    expect(shot.taskId).toBeUndefined();
    expect(shot.assetUrl).toBe('/clip.mp4');
  });

  it.each(['speech', 'references'])('invalidates an incomplete current plan (%s) without discarding its task', (missing) => {
    const saved = savedDraft(3);
    Object.assign(saved.scripts[0].shots[0], { speechMode: 'voiceover' });
    Object.assign(saved.scripts[0].assets[0], { productImageIndexes: [7] });
    if (missing === 'speech') Reflect.deleteProperty(saved.scripts[0].shots[0], 'speechMode');
    else Reflect.deleteProperty(saved.scripts[0].assets[0], 'productImageIndexes');
    storageFor(saved);
    expect(readSalesStudioDraft().scripts[0]).toMatchObject({ planStale: true, renderTaskId: 'paid-video', assets: [{ taskId: 'paid-image' }] });
  });
});
