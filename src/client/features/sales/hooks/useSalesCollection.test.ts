import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recognizeProductImage, SalesOCRError } from '../api/recognizeProductImage';
import { collectEcommerceProduct } from '../api/collectProduct';
import { summarizeProduct } from '../api/summarizeProduct';
import { uploadSalesImages } from '../api/uploadSalesImages';
import { emptySalesCollection, readSalesCollection, writeSalesCollection } from '../model/salesCollectionDraft';
import { useSalesCollection } from './useSalesCollection';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], cleanup: undefined as (() => void) | undefined }));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => (() => void)) => { if (!hooks.cleanup) hooks.cleanup = fn(); },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
    }];
  },
}));
vi.mock('../api/recognizeProductImage', async (original) => ({ ...await original<typeof import('../api/recognizeProductImage')>(), recognizeProductImage: vi.fn() }));
vi.mock('../api/collectProduct', () => ({ collectEcommerceProduct: vi.fn() }));
vi.mock('../api/summarizeProduct', () => ({ summarizeProduct: vi.fn() }));
vi.mock('../api/uploadSalesImages', () => ({ uploadSalesImages: vi.fn() }));
vi.mock('../model/salesCollectionDraft', async (original) => ({ ...await original<typeof import('../model/salesCollectionDraft')>(), readSalesCollection: vi.fn(), writeSalesCollection: vi.fn() }));
const result = { engine: 'test', width: 800, height: 4200, text: '棉 61.7%', lines: [], cached: false };
const summaryResponse = { success: true as const, model: 'vision', skillVersion: 'product-selling-points:1', result: { summary: '条纹设计', points: [{ feature: '条纹', benefit: '搭配有层次', expression: '可配纯色下装。', sources: ['image-4'] }], copy: '条纹上衣可配纯色下装。', copyPointIndexes: [1], conflicts: [], questions: [], cautions: [] } };
function Render() { hooks.index = 0; return useSalesCollection(); }
beforeEach(() => {
  vi.useFakeTimers();
  hooks.index = 0; hooks.slots = []; hooks.cleanup = undefined;
  vi.resetAllMocks();
  vi.mocked(readSalesCollection).mockReturnValue({ ...emptySalesCollection(), productUrl: 'https://item.jd.com/1234567.html',
    imageCatalog: [{ index: 3, url: '/a.png', role: 'main' }, { index: 9, url: '/b.png', role: 'detail' }],
    ocrImageUrls: ['/a.png', '/b.png'],
  });
});
afterEach(() => { hooks.cleanup?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('collection OCR workflow', () => {
  it('keeps partial successes, retries failures and skips recognized images', async () => {
    vi.mocked(recognizeProductImage).mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('取图失败'));
    await Render().recognizeImages();
    expect(Render().state.ocrImages).toEqual([
      { imageUrl: '/a.png', result, editedText: result.text, error: undefined },
      { imageUrl: '/b.png', editedText: '', error: '取图失败' },
    ]);
    expect(Render().state.sellingPoints).toBe('');
    expect(Render().state.ocrImages.every((entry) => !entry.confirmedText)).toBe(true);
    vi.mocked(recognizeProductImage).mockResolvedValue(result);
    await Render().recognizeImages();
    expect(recognizeProductImage).toHaveBeenCalledTimes(3);
    expect(vi.mocked(recognizeProductImage).mock.calls[2][0]).toBe('/b.png');
    expect(Render().state.ocrImages.every((entry) => !entry.error)).toBe(true);
    vi.advanceTimersByTime(250);
    expect(writeSalesCollection).toHaveBeenCalled();
  });
  it('blocks collection and state replacement during OCR, then discards canceled responses', async () => {
    let resolve!: (value: typeof result) => void;
    vi.mocked(recognizeProductImage).mockReturnValue(new Promise((done) => { resolve = done; }));
    const run = Render().recognizeImages();
    expect(Render().ocrProgress).toMatchObject({ current: 1, total: 2 });
    Render().updateState({ productName: '不应替换' });
    Render().updateState({ colorSelection: { colorLabel: '', confirmedImageUrls: ['/b.png'], excludedImageUrls: [] } });
    Render().addOCRImages(['/foreign.png']);
    expect(Render().state.colorSelection.confirmedImageUrls).toEqual(['/b.png']);
    await Render().runProductCollect();
    expect(collectEcommerceProduct).not.toHaveBeenCalled();
    expect(Render().state.productName).toBe('');
    Render().cancelOCR();
    expect(vi.mocked(recognizeProductImage).mock.calls[0][1].aborted).toBe(true);
    resolve(result);
    await run;
    expect(Render().state.ocrImages).toEqual([]);
    expect(Render().ocrProgress).toBeNull();
    expect(recognizeProductImage).toHaveBeenCalledTimes(1);
  });
  it('preserves confirmed notes during explicit reruns, clears all OCR for a newly collected product', async () => {
    Render().updateState({ ocrImages: [{ imageUrl: '/a.png', editedText: '编辑', confirmedText: '已确认', result }] });
    vi.mocked(recognizeProductImage).mockResolvedValue(result);
    await Render().recognizeImages('/a.png', true);
    expect(recognizeProductImage).toHaveBeenCalledWith('/a.png', expect.any(AbortSignal), true);
    expect(Render().state.ocrImages[0]).toMatchObject({ editedText: '编辑', confirmedText: '已确认' });
    vi.mocked(collectEcommerceProduct).mockResolvedValue({ ...emptySalesCollection(), productName: '新商品', imageCatalog: [{ index: 0, url: '/new.png', role: 'main' }] });
    await Render().runProductCollect();
    expect(Render().state).toMatchObject({ productName: '新商品', ocrImages: [], ocrImageUrls: [], step: 'images' });
  });
});

describe('workflow recovery and storage', () => {
  it('refreshes the current product upstream while retaining selected images and reviewed text', async () => {
    Render().updateState({ collectedProductUrl: 'https://item.jd.com/1234567.html',
      colorSelection: { colorLabel: '', confirmedImageUrls: ['/a.png'], excludedImageUrls: [] },
      ocrImages: [{ imageUrl: '/a.png', editedText: '已核对', confirmedText: '已核对', result }],
    });
    vi.mocked(collectEcommerceProduct).mockResolvedValue({ ...emptySalesCollection(), productUrl: 'https://item.jd.com/1234567.html',
      imageCatalog: [{ index: 0, url: '/new.png', role: 'detail' }], fromCache: false });
    await Render().runProductCollect();
    expect(collectEcommerceProduct).toHaveBeenLastCalledWith('https://item.jd.com/1234567.html', 'jd', expect.any(AbortSignal), true);
    expect(Render().state.colorSelection.confirmedImageUrls).toEqual(['/a.png']);
    expect(Render().state.ocrImages[0].confirmedText).toBe('已核对');
    expect(Render().state.imageCatalog.map((image) => image.url)).toContain('/new.png');
    Render().updateState({ productUrl: 'https://item.jd.com/9876543.html' });
    await Render().runProductCollect();
    expect(collectEcommerceProduct).toHaveBeenLastCalledWith('https://item.jd.com/9876543.html', 'jd', expect.any(AbortSignal), false);
  });
  it('flushes the latest pending edit when leaving the workspace', () => {
    Render().updateState({ productName: '离开前最后一次编辑' });
    expect(writeSalesCollection).not.toHaveBeenCalled();
    hooks.cleanup?.();
    expect(writeSalesCollection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeSalesCollection).mock.calls[0][0].productName).toBe('离开前最后一次编辑');
    vi.runAllTimers();
    expect(writeSalesCollection).toHaveBeenCalledTimes(1);
  });
  it('stops a batch on unavailable OCR service and leaves other images retryable', async () => {
    vi.mocked(recognizeProductImage).mockRejectedValueOnce(new SalesOCRError('环境未安装', 503));
    await Render().recognizeImages();
    expect(recognizeProductImage).toHaveBeenCalledTimes(1);
    expect(Render().ocrReport).toMatchObject({ status: 'stopped', succeeded: 0, failed: 1, remaining: 1, message: '环境未安装' });
    vi.mocked(recognizeProductImage).mockResolvedValue(result);
    await Render().retryFailedImages();
    expect(recognizeProductImage).toHaveBeenCalledTimes(2);
    expect(Render().state.ocrImages).toHaveLength(1);
    await Render().recognizeImages();
    expect(vi.mocked(recognizeProductImage).mock.calls[2][0]).toBe('/b.png');
  });
  it('reports canceled work and retains successful images for continuing later', async () => {
    vi.mocked(recognizeProductImage).mockResolvedValueOnce(result).mockImplementationOnce(async (_url, signal) => {
      Render().cancelOCR();
      signal.throwIfAborted();
      return result;
    });
    await Render().recognizeImages();
    expect(Render().ocrReport).toMatchObject({ status: 'stopped', succeeded: 1, failed: 0, remaining: 1 });
    expect(Render().state.ocrImages.map((entry) => entry.imageUrl)).toEqual(['/a.png']);
  });
  it('shows storage failures without discarding changes in the current page', () => {
    vi.mocked(writeSalesCollection).mockImplementation(() => { throw new Error('quota'); });
    Render().updateState({ productName: '仍在当前页面' });
    expect(Render().state.productName).toBe('仍在当前页面');
    expect(Render().saveStatus).toBe('saving');
    vi.advanceTimersByTime(250);
    expect(Render().saveStatus).toBe('error');
    vi.mocked(writeSalesCollection).mockImplementation(() => undefined);
    Render().updateState({ brand: '继续保存' });
    vi.advanceTimersByTime(250);
    expect(Render().saveStatus).toBe('saved');
    expect(Render().error).toBeNull();
    expect(Render().state.productName).toBe('仍在当前页面');
  });
  it('retries saving without requiring the user to change their draft again', () => {
    vi.mocked(writeSalesCollection).mockImplementationOnce(() => { throw new Error('quota'); });
    Render().updateState({ productName: '完整草稿' });
    expect(Render().flushDraft()).toBe(false);
    expect(Render().saveStatus).toBe('error');
    expect(Render().flushDraft()).toBe(true);
    expect(Render().saveStatus).toBe('saved');
    expect(Render().error).toBeNull();
    expect(vi.mocked(writeSalesCollection).mock.calls[1][0].productName).toBe('完整草稿');
  });
  it('flushes on browser navigation and only warns if the draft still cannot be saved', () => {
    const listeners = new Map<string, (event: BeforeUnloadEvent) => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: (event: BeforeUnloadEvent) => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    Render().updateState({ productName: '导航前的编辑' });
    const event = { preventDefault: vi.fn(), returnValue: undefined };
    vi.mocked(writeSalesCollection).mockImplementationOnce(() => { throw new Error('quota'); });
    listeners.get('beforeunload')!(event as unknown as BeforeUnloadEvent);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(Render().saveStatus).toBe('error');
    event.preventDefault.mockClear();
    listeners.get('beforeunload')!(event as unknown as BeforeUnloadEvent);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(Render().saveStatus).toBe('saved');
    hooks.cleanup?.();
    expect(listeners.size).toBe(0);
  });
  it('retains production preferences edited while refreshing the current product', async () => {
    let finish!: (product: ReturnType<typeof emptySalesCollection>) => void;
    vi.mocked(collectEcommerceProduct).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    Render().updateState({ collectedProductUrl: 'https://item.jd.com/1234567.html' });
    const run = Render().runProductCollect();
    Render().updateState({ summaryModel: 'vision-new', productionPlan: { ...Render().state.productionPlan, videoModel: 'video-new' } });
    expect(Render().state.productionPlan.videoModel).toBe('video-new');
    finish({ ...emptySalesCollection(), productUrl: 'https://item.jd.com/1234567.html' });
    await run;
    expect(Render().state.summaryModel).toBe('vision-new');
    expect(Render().state.productionPlan.videoModel).toBe('video-new');
  });
  it('invalidates old mixes for asset-library edits while retaining fresh generation receipts', () => {
    const plan = { ...Render().state.productionPlan, generatedVideoUrl: '/raw.mp4', voiceoverAudioUrl: '/voice.mp3' };
    Render().updateState({ productionPlan: plan });
    Render().updateState({ productionPlan: { ...Render().state.productionPlan, mixedVideoUrl: '/final.mp4' } });
    expect(Render().state.productionPlan.mixedVideoUrl).toBe('/final.mp4');
    Render().updateState({ productionPlan: { ...Render().state.productionPlan, customBgmUrl: '/new-music.mp3' } });
    expect(Render().state.productionPlan).toMatchObject({ generatedVideoUrl: '/raw.mp4', voiceoverAudioUrl: '/voice.mp3', mixedVideoUrl: '' });
    Render().updateState({ productionPlan: { ...Render().state.productionPlan, mixedVideoUrl: '/new-final.mp4' } });
    Render().updateState({ productionPlan: { ...Render().state.productionPlan } });
    expect(Render().state.productionPlan.mixedVideoUrl).toBe('/new-final.mp4');
  });
});


describe('independent click and drag destinations', () => {
  it('recognizes only the requested category while retaining other queued images and references', async () => {
    Render().updateState({ colorSelection: { colorLabel: '', confirmedImageUrls: ['/a.png'], excludedImageUrls: [] } });
    vi.mocked(recognizeProductImage).mockResolvedValue(result);
    await Render().recognizeImages(undefined, false, false, ['/b.png', '/foreign.png']);
    expect(vi.mocked(recognizeProductImage).mock.calls.map(([url]) => url)).toEqual(['/b.png']);
    expect(Render().state.ocrImageUrls).toEqual(['/a.png', '/b.png']);
    expect(Render().state.colorSelection.confirmedImageUrls).toEqual(['/a.png']);
    expect(Render().state.ocrImages.map((entry) => entry.imageUrl)).toEqual(['/b.png']);
    await Render().recognizeImages(undefined, false, false, []);
    expect(recognizeProductImage).toHaveBeenCalledTimes(1);
  });
  it('queues only OCR-targeted uploads and preserves references and partial upload successes', async () => {
    Render().updateState({ ocrImageUrls: [], colorSelection: { colorLabel: '', confirmedImageUrls: ['/a.png'], excludedImageUrls: [] } });
    vi.mocked(uploadSalesImages).mockResolvedValueOnce({ urls: ['/new.png'], failed: 1 });
    await Render().addProductImages([new File(['a'], 'a.png', { type: 'image/png' })], true);
    expect(Render().state.ocrImageUrls).toEqual(['/new.png']);
    expect(Render().state.colorSelection.confirmedImageUrls).toEqual(['/a.png']);
    expect(Render().error).toContain('1 张已上传');
    vi.mocked(uploadSalesImages).mockResolvedValueOnce({ urls: ['/gallery.png'], failed: 0 });
    await Render().addProductImages([new File(['b'], 'b.png', { type: 'image/png' })]);
    expect(Render().state.imageCatalog.map((image) => image.url)).toContain('/gallery.png');
    expect(Render().state.ocrImageUrls).toEqual(['/new.png']);
    expect(recognizeProductImage).not.toHaveBeenCalled();
  });
  it('queues OCR images idempotently without selecting product references or starting OCR', () => {
    Render().updateState({ ocrImageUrls: [], colorSelection: { colorLabel: '', confirmedImageUrls: ['/a.png'], excludedImageUrls: [] } });
    Render().addOCRImages(['/b.png', '/b.png', 'https://foreign.example/a.png']);
    expect(Render().state.ocrImageUrls).toEqual(['/b.png']);
    expect(Render().state.colorSelection.confirmedImageUrls).toEqual(['/a.png']);
    expect(recognizeProductImage).not.toHaveBeenCalled();
  });
  it('removes and re-adds queue images while keeping edits, confirmations and product references', () => {
    const entry = { imageUrl: '/a.png', editedText: '已核对文字', confirmedText: '已核对文字', result };
    Render().updateState({ ocrImages: [entry], ocrImageUrls: ['/a.png'], colorSelection: { colorLabel: '', confirmedImageUrls: ['/a.png'], excludedImageUrls: [] } });
    Render().updateState({ ocrImageUrls: [] });
    expect(Render().state.ocrImages).toEqual([entry]);
    expect(Render().state.colorSelection.confirmedImageUrls).toEqual(['/a.png']);
    Render().addOCRImages(['/a.png']);
    expect(Render().state.ocrImageUrls).toEqual(['/a.png']);
    expect(Render().state.ocrImages).toEqual([entry]);
  });
});

describe('edited product selling points workflow', () => {
  function ready() {
    Render().updateState({ ocrImageUrls: ['/a.png'], ocrImages: [{ imageUrl: '/a.png', editedText: '用户修正的识别文字', result }], colorSelection: { colorLabel: '', confirmedImageUrls: ['/a.png'], excludedImageUrls: [] } });
  }
  it('requires usable text, uses current edits, blocks duplicate summaries and saves a separate result', async () => {
    await Render().summarize('vision');
    expect(summarizeProduct).not.toHaveBeenCalled();
    expect(Render().summaryError).toContain('识别文字');
    ready();
    let finish!: (value: typeof summaryResponse) => void;
    vi.mocked(summarizeProduct).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const run = Render().summarize('vision');
    expect(Render().isSummarizing).toBe(true);
    await Render().summarize('vision');
    expect(collectEcommerceProduct).not.toHaveBeenCalled();
    expect(summarizeProduct).toHaveBeenCalledTimes(1);
    expect(vi.mocked(summarizeProduct).mock.calls[0][0].textImages[0].text).toBe('用户修正的识别文字');
    expect(Render().state.colorSelection.confirmedImageUrls).toEqual(['/a.png']);
    finish(summaryResponse); await run;
    expect(Render().state.productSummary).toMatchObject({ result: summaryResponse.result, model: 'vision' });
    expect(Render().state.sellingPoints).toBe('');
    expect(Render().isSummarizing).toBe(false);
  });
  it('extracts pasted text without OCR and preserves it and the last final result on failure', async () => {
    Render().updateState({ ocrImageUrls: [], sellingPoints: '手动补充的棉质上衣' });
    vi.mocked(summarizeProduct).mockResolvedValueOnce(summaryResponse);
    await Render().summarize('vision');
    expect(vi.mocked(summarizeProduct).mock.calls[0][0]).toMatchObject({ facts: '手动补充的棉质上衣', textImages: [] });
    const saved = Render().state.productSummary;
    vi.mocked(summarizeProduct).mockRejectedValueOnce(new Error('网络中断'));
    await Render().summarize('vision');
    expect(Render().state.sellingPoints).toBe('手动补充的棉质上衣');
    expect(Render().state.productSummary).toEqual(saved);
    expect(Render().summaryError).toBe('网络中断');
    expect(recognizeProductImage).not.toHaveBeenCalled();
  });
  it('keeps user text entered before recognition and stores the new OCR original separately', async () => {
    Render().updateState({ ocrImageUrls: ['/a.png'], ocrImages: [{ imageUrl: '/a.png', editedText: '用户事先输入的文字' }] });
    vi.mocked(recognizeProductImage).mockResolvedValueOnce(result);
    await Render().recognizeImages('/a.png');
    expect(Render().state.ocrImages[0]).toMatchObject({ result, editedText: '用户事先输入的文字' });
  });
  it('keeps last good results when retry fails or is canceled, discards late responses', async () => {
    ready(); vi.mocked(summarizeProduct).mockResolvedValue(summaryResponse);
    await Render().summarize('vision');
    const saved = Render().state.productSummary;
    const text = Render().state.ocrImages[0].editedText;
    vi.mocked(summarizeProduct).mockRejectedValue(new Error('余额不足'));
    await Render().summarize('vision');
    expect(Render().state.productSummary).toEqual(saved);
    expect(Render().state.ocrImages[0].editedText).toBe(text);
    expect(Render().summaryError).toBe('余额不足');
    let finish!: (value: typeof summaryResponse) => void;
    vi.mocked(summarizeProduct).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const run = Render().summarize('vision');
    expect(Render().state.productSummary).toEqual(saved);
    Render().cancelSummary(); finish({ ...summaryResponse, result: { ...summaryResponse.result, summary: '不应写入' } });
    await run;
    expect(Render().state.productSummary).toEqual(saved);
  });
  it('retains an earlier OCR result and edits while retrying and after recognition fails', async () => {
    ready();
    const previous = Render().state.ocrImages[0];
    let fail!: (reason: Error) => void;
    vi.mocked(recognizeProductImage).mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const run = Render().recognizeImages('/a.png', true);
    expect(Render().state.ocrImages[0]).toEqual(previous);
    fail(new Error('重新识别失败')); await run;
    expect(Render().state.ocrImages[0]).toMatchObject({ result, editedText: previous.editedText, error: '重新识别失败' });
  });
  it('does not attach a response when source images become unavailable', async () => {
    ready();
    let finish!: (value: typeof summaryResponse) => void;
    vi.mocked(summarizeProduct).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const run = Render().summarize('vision');
    Render().markImageUnavailable(3); finish(summaryResponse); await run;
    expect(Render().state.productSummary).toBeUndefined();
    expect(Render().summaryError).toContain('资料已更新');
  });
  it('allows source changes while a model is pending, cancels stale work and protects the next request', async () => {
    ready();
    let oldDone!: (value: typeof summaryResponse) => void;
    let newDone!: (value: typeof summaryResponse) => void;
    vi.mocked(summarizeProduct).mockReturnValueOnce(new Promise((resolve) => { oldDone = resolve; })).mockReturnValueOnce(new Promise((resolve) => { newDone = resolve; }));
    const oldRun = Render().summarize('vision');
    Render().updateState({ colorSelection: { colorLabel: '', confirmedImageUrls: ['/b.png'], excludedImageUrls: [] } });
    expect(Render().state.colorSelection.confirmedImageUrls).toEqual(['/b.png']);
    expect(Render().isSummarizing).toBe(false);
    expect(vi.mocked(summarizeProduct).mock.calls[0][2].aborted).toBe(true);
    const newRun = Render().summarize('vision');
    oldDone(summaryResponse); await oldRun;
    expect(Render().isSummarizing).toBe(true);
    expect(Render().state.productSummary).toBeUndefined();
    newDone({ ...summaryResponse, result: { ...summaryResponse.result, summary: '新选图的结果' } }); await newRun;
    expect(Render().isSummarizing).toBe(false);
    expect(Render().state.productSummary?.result.summary).toBe('新选图的结果');
    expect(Render().state.productSummary?.inputKey).toContain('/b.png');
  });
});
