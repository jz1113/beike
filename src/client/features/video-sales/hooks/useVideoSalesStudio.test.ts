import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoSalesScript } from '@shared/domain/video-sales';
import { collectEcommerceProduct } from '../api/collectProduct';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { buildSalesPlan } from '../model/buildSalesPlan';
import { executeSalesRender } from '../model/executeSalesRender';
import { defaultSalesStudioState, readSalesStudioDraft } from '../model/salesStudioDraft';
import { mapCollectedSalesProduct } from '../model/productLink';
import { useVideoSalesStudio, type VideoSalesStudioState } from './useVideoSalesStudio';

const commits = vi.hoisted(() => ({ states: [] as unknown[] }));

vi.mock('react', () => ({
  useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, (next: unknown) => {
    if (next && typeof next === 'object' && 'scripts' in next) commits.states.push(next);
  }],
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
}));
vi.mock('@client/shared/api/uploadStudioFile', () => ({ uploadStudioFile: vi.fn() }));
vi.mock('@client/shared/utils/confirmAction', () => ({ confirmAction: vi.fn() }));
vi.mock('../model/buildSalesPlan', () => ({ buildSalesPlan: vi.fn() }));
vi.mock('../model/executeSalesRender', () => ({ executeSalesRender: vi.fn() }));
vi.mock('../api/collectProduct', () => ({ collectEcommerceProduct: vi.fn() }));
vi.mock('../model/salesStudioDraft', async (importOriginal) => ({
  ...await importOriginal<typeof import('../model/salesStudioDraft')>(),
  readSalesStudioDraft: vi.fn(),
}));

function existingProject(): VideoSalesStudioState {
  const script: VideoSalesScript = {
    id: 'existing', title: '已有方案', totalDuration: 3,
    seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
    personFrameUrl: 'https://example.com/person.jpg', sceneFrameUrl: 'https://example.com/scene.jpg',
    renderTaskId: 'completed-render', renderStatus: 'done',
    shots: [{
      shotId: 1, type: 'demo', duration: 3, description: '旧商品', camera: '特写',
      visualSource: 'product_image', transition: 'direct_concat', voiceover: '旧卖点',
      imageIndex: 0, prompt: '旧提示词', finalPrompt: '旧定稿', promptStale: false,
      referenceFrameUrl: 'https://example.com/reference.jpg', assetUrl: 'https://example.com/shot.mp4',
      taskId: 'completed-shot', status: 'done',
    }],
  };
  return {
    ...defaultSalesStudioState, productUrl: 'https://item.jd.com/1234567.html',
    scripts: [script, { ...script, id: 'alternative' }], selectedScriptIndex: 1,
    composedResultUrl: 'https://example.com/final.mp4',
    analysis: {
      productName: '旧商品', category: 'other',
      visualFeatures: { mainColor: '', designStyle: '', productForm: '', texture: '' },
      sellingPoints: [], targetAudience: '', usageScenarios: [], painPoints: [],
      videoSuggestions: { recommendedAngles: [], keyVisuals: [], suggestedStyle: '' },
    },
  };
}

function StudioHarness() {
  return useVideoSalesStudio();
}

function latestCommit(): VideoSalesStudioState {
  return commits.states.at(-1) as VideoSalesStudioState;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('video sales clear current product safety', () => {
  beforeEach(() => {
    commits.states.length = 0;
    vi.mocked(confirmAction).mockReset().mockResolvedValue(true);
    vi.mocked(uploadStudioFile).mockReset();
    vi.mocked(collectEcommerceProduct).mockReset();
    vi.mocked(buildSalesPlan).mockReset();
    vi.mocked(executeSalesRender).mockReset();
    vi.mocked(readSalesStudioDraft).mockReturnValue({
      ...existingProject(), productName: '旧商品', category: 'fashion',
      selectedChatModel: 'chat', selectedVideoModel: 'video', targetDuration: 10,
      productImages: ['/product.jpg'], imageCatalog: [{ index: 0, role: 'main', url: '/product.jpg' }],
      colorSelection: { colorLabel: '黑色', confirmedImageUrls: ['/product.jpg'], excludedImageUrls: [] },
      fashionRefs: { personUrl: '/person.jpg', faceUrl: '/face.jpg', sceneUrl: '/scene.jpg' },
      collectionSource: '缓存', fromCache: true, detailsMissing: true,
    });
  });

  it('asks for confirmation and clears all product content but retains preferences', async () => {
    const studio = StudioHarness();
    expect(await studio.resetProject()).toBe(true);
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: '清空当前商品？', description: expect.stringContaining('服务端生成记录') }));
    expect(latestCommit()).toMatchObject({
      productName: '', productUrl: '', productImages: [], imageCatalog: [], scripts: [],
      fashionRefs: { personUrl: '', faceUrl: '', sceneUrl: '' }, analysis: null, composedResultUrl: null,
      category: 'fashion', selectedChatModel: 'chat', selectedVideoModel: 'video', targetDuration: 10,
    });
    expect(latestCommit().collectionSource).toBeUndefined();
    expect(latestCommit().fromCache).toBeUndefined();
    expect(latestCommit().detailsMissing).toBeUndefined();
    expect(collectEcommerceProduct).not.toHaveBeenCalled();
    expect(uploadStudioFile).not.toHaveBeenCalled();
    expect(await studio.resetProject()).toBe(false);
    expect(confirmAction).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft untouched when cancelled', async () => {
    vi.mocked(confirmAction).mockResolvedValue(false);
    expect(await StudioHarness().resetProject()).toBe(false);
    expect(commits.states).toHaveLength(0);
  });

  it('skips the dialog when no product content exists', async () => {
    vi.mocked(readSalesStudioDraft).mockReturnValue(defaultSalesStudioState);
    expect(await StudioHarness().resetProject()).toBe(false);
    expect(confirmAction).not.toHaveBeenCalled();
  });

  it('prevents duplicate confirmation dialogs', async () => {
    const confirmation = deferred<boolean>();
    vi.mocked(confirmAction).mockReturnValue(confirmation.promise);
    const studio = StudioHarness();
    const reset = studio.resetProject();
    expect(await studio.resetProject()).toBe(false);
    expect(confirmAction).toHaveBeenCalledTimes(1);
    confirmation.resolve(true);
    expect(await reset).toBe(true);
    expect(commits.states).toHaveLength(1);
  });

  it.each(['collect', 'upload', 'reference', 'plan', 'render'] as const)('blocks clearing while %s is running', async (job) => {
    const pending = deferred<never>();
    vi.mocked(collectEcommerceProduct).mockReturnValue(pending.promise);
    vi.mocked(uploadStudioFile).mockReturnValue(pending.promise);
    vi.mocked(buildSalesPlan).mockReturnValue(pending.promise);
    vi.mocked(executeSalesRender).mockReturnValue(pending.promise);
    if (job === 'render') {
      const draft = structuredClone(vi.mocked(readSalesStudioDraft)());
      draft.scripts[draft.selectedScriptIndex].renderStatus = undefined;
      vi.mocked(readSalesStudioDraft).mockReturnValue(draft);
    }
    const studio = StudioHarness();
    const file = new File(['image'], 'product.png', { type: 'image/png' });
    const task = job === 'collect' ? studio.runProductCollect()
      : job === 'upload' ? studio.addProductImages([file])
        : job === 'reference' ? studio.setFashionRef('personUrl', file)
          : job === 'plan' ? studio.runPlan() : studio.runRender();
    expect(await studio.resetProject()).toBe(false);
    expect(confirmAction).not.toHaveBeenCalled();
    expect(commits.states).toHaveLength(0);
    pending.reject(new Error('模拟任务失败'));
    await task;
    expect(await studio.resetProject()).toBe(true);
  });

  it('rechecks busy state after confirmation and avoids stale reference uploads', async () => {
    const confirmation = deferred<boolean>();
    const upload = deferred<string>();
    vi.mocked(confirmAction).mockReturnValue(confirmation.promise);
    vi.mocked(uploadStudioFile).mockReturnValue(upload.promise);
    const studio = StudioHarness();
    const reset = studio.resetProject();
    const file = new File(['image'], 'person.png', { type: 'image/png' });
    const task = studio.setFashionRef('personUrl', file);
    confirmation.resolve(true);
    expect(await reset).toBe(false);
    expect(commits.states).toHaveLength(0);
    await studio.runProductCollect();
    await studio.addProductImages([file]);
    await studio.setFashionRef('faceUrl', file);
    expect(collectEcommerceProduct).not.toHaveBeenCalled();
    expect(uploadStudioFile).toHaveBeenCalledTimes(1);
    upload.resolve('/new-person.jpg');
    await task;
    expect(latestCommit().fashionRefs.personUrl).toBe('/new-person.jpg');
    vi.mocked(confirmAction).mockResolvedValue(true);
    expect(await studio.resetProject()).toBe(true);
    expect(latestCommit().fashionRefs.personUrl).toBe('');
  });

  it('clears an individual reference without uploading and allows a subsequent reset', async () => {
    const studio = StudioHarness();
    await studio.setFashionRef('faceUrl', null);
    expect(latestCommit().fashionRefs.faceUrl).toBe('');
    expect(uploadStudioFile).not.toHaveBeenCalled();
    expect(await studio.resetProject()).toBe(true);
  });
});

describe('video sales collection refresh safety', () => {
  beforeEach(() => {
    commits.states.length = 0;
    vi.mocked(collectEcommerceProduct).mockReset();
    vi.mocked(readSalesStudioDraft).mockReturnValue(existingProject());
    vi.stubGlobal('window', { confirm: vi.fn().mockReturnValue(true) });
    vi.mocked(collectEcommerceProduct).mockResolvedValue(mapCollectedSalesProduct({
      product: { title: '新商品', mainImages: ['https://example.com/new.jpg'] },
    }, 'https://item.jd.com/1234567.html'));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('invalidates all old prompts and derived frames while preserving completed assets', async () => {
    const original = existingProject();
    vi.mocked(readSalesStudioDraft).mockReturnValue(original);
    const studio = StudioHarness();
    expect(await studio.runProductCollect(false, true)).toBe(true);
    const updated = latestCommit();
    expect(collectEcommerceProduct).toHaveBeenCalledWith(original.productUrl, 'jd', expect.any(AbortSignal), true);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('旧方案需要更新'));
    expect(updated.analysis).toBeNull();
    expect(updated.productImages).toEqual(['https://example.com/new.jpg']);
    expect(updated.composedResultUrl).toBe(original.composedResultUrl);
    expect(updated.selectedScriptIndex).toBe(1);
    expect(updated.scripts).toHaveLength(2);
    for (const script of updated.scripts) {
      expect(script.personFrameUrl).toBeUndefined();
      expect(script.sceneFrameUrl).toBeUndefined();
      expect(script.renderTaskId).toBe('completed-render');
      expect(script.shots[0]).toMatchObject({ promptStale: true, assetUrl: 'https://example.com/shot.mp4', taskId: 'completed-shot', status: 'done', prompt: '旧提示词' });
      expect(script.shots[0].referenceFrameUrl).toBeUndefined();
    }
    expect(original.scripts[0].shots[0].promptStale).toBe(false);
    expect(original.scripts[0].personFrameUrl).toBe('https://example.com/person.jpg');
  });

  it('leaves existing scripts untouched when refresh fails', async () => {
    vi.mocked(collectEcommerceProduct).mockRejectedValue(new Error('采集失败'));
    const studio = StudioHarness();
    expect(await studio.runProductCollect(false, true)).toBe(false);
    expect(commits.states).toHaveLength(0);
    expect(studio.state.scripts[0].shots[0].promptStale).toBe(false);
    expect(studio.state.composedResultUrl).toBe('https://example.com/final.mp4');
  });

  it('does not collect or invalidate prompts when confirmation is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const studio = StudioHarness();
    expect(await studio.runProductCollect(false, true)).toBe(false);
    expect(collectEcommerceProduct).not.toHaveBeenCalled();
    expect(commits.states).toHaveLength(0);
  });

  it('keeps the selected skill when collection infers another category', async () => {
    vi.mocked(readSalesStudioDraft).mockReturnValue({ ...existingProject(), category: 'fashion' });
    vi.mocked(collectEcommerceProduct).mockResolvedValue(mapCollectedSalesProduct({
      product: { title: '精华液', category: '美妆护肤', mainImages: ['https://example.com/new.jpg'] },
    }, 'https://item.jd.com/1234567.html'));
    const studio = StudioHarness();
    expect(await studio.runProductCollect()).toBe(true);
    expect(latestCommit().category).toBe('fashion');
    expect(latestCommit().productName).toBe('精华液');
  });

  it('uses cached collection without deleting historical results or receipts', async () => {
    const studio = StudioHarness();
    expect(await studio.runProductCollect()).toBe(true);
    expect(collectEcommerceProduct).toHaveBeenCalledWith(studio.state.productUrl, 'jd', expect.any(AbortSignal), false);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(latestCommit()).toMatchObject({ analysis: null, composedResultUrl: 'https://example.com/final.mp4', selectedScriptIndex: 1 });
    expect(latestCommit().scripts).toHaveLength(2);
    expect(latestCommit().scripts[1]).toMatchObject({ planStale: true, renderTaskId: 'completed-render', renderResultUrl: 'https://example.com/final.mp4' });
  });
});
