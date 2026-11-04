import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSalesAssetViews } from './useSalesAssetViews';
import type { AssetViewRequest, AssetViewStage } from '../api/salesAssetViews';
import type { SalesAssetDraft, SalesAssetDraftPersistence } from '../model/salesAssetDraft';
import { uploadSalesViewImage } from '../api/salesAssetViews';
import { PERSONA_VIEWS, readPersonaViews } from '../model/salesPersonaViews';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], cleanup: undefined as (() => void) | undefined }));
vi.mock('react', () => ({
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
vi.mock('@client/shared/api/generation/seedancePrecheck', () => ({ runSeedancePrecheck: vi.fn() }));
vi.mock('@client/shared/models/configuredModels', () => ({ loadSystemConfiguredModels: () => ({ selectedImageGenModel: 'test', availableImageModels: [{ id: 'test' }, { id: 'new-model' }] }) }));
vi.mock('../api/salesAssetViews', () => ({ uploadSalesViewImage: vi.fn() }));
const generate = vi.fn<(request: AssetViewRequest, signal: AbortSignal, onStage: (stage: AssetViewStage) => void, onProgress: () => void) => Promise<Record<string, string>>>();
const generated = Object.fromEntries(PERSONA_VIEWS.filter(({ id }) => id !== 'main').map(({ id }) => [id, `/${id}.jpg`]));
function Render(draft?: SalesAssetDraftPersistence) {
  hooks.index = 0;
  return useSalesAssetViews({
    draft, initial: () => ({ views: { ...readPersonaViews().views, main: '/main.jpg' }, extraImages: [] }),
    definitions: PERSONA_VIEWS, referenceKeys: ['main', 'face'], prefix: 'persona-view', generate,
  });
}
function deferred() {
  let resolve!: (images: Record<string, string>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Record<string, string>>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => { hooks.index = 0; hooks.slots = []; hooks.cleanup = undefined; vi.clearAllMocks(); });
afterEach(() => { hooks.cleanup?.(); });

describe('one grid for all asset views', () => {
  it('saves manual uploads through the JPG pipeline', async () => {
    const file = new File(['png'], '人物.png', { type: 'image/png' });
    vi.mocked(uploadSalesViewImage).mockResolvedValueOnce('/person.jpg');
    await Render().upload('main', file);
    expect(uploadSalesViewImage).toHaveBeenCalledWith(file, '人物.png', expect.any(AbortSignal));
    expect(Render().views.main).toBe('/person.jpg');
    expect(Render().active).toEqual([]);
  });
  it('generates once for all four missing views and blocks duplicate clicks', async () => {
    const result = deferred();
    generate.mockReturnValueOnce(result.promise);
    const run = Render().generate();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(Render().active).toHaveLength(4);
    await Render().generate();
    expect(generate).toHaveBeenCalledTimes(1);
    result.resolve(generated);
    await run;
    expect(Render().views).toEqual({ sheet: '', main: '/main.jpg', ...generated });
    expect(Render().active).toEqual([]);
    expect(Render().notice).toContain('4 张');
  });
  it('retains the request and original model for retries of a failed crop', async () => {
    generate.mockImplementationOnce(async (request) => { request.resultUrl = '/grid.png'; throw new Error('裁切保存失败'); });
    await Render().generate();
    expect(Render().recovering).toBe(true);
    expect(Render().error).toContain('裁切保存失败');
    expect(Render().notice).toContain('无需重新生图');
    expect(Render().stage).toBe('');
    Render().setModel('new-model');
    generate.mockResolvedValueOnce(generated);
    await Render().generate();
    expect(generate.mock.calls[1][0]).toBe(generate.mock.calls[0][0]);
    expect(generate.mock.calls[1][0]).toMatchObject({ resultUrl: '/grid.png', model: 'test' });
    expect(Render().missing).toEqual([]);
  });
  it('shows generation and crop stages and offers recovery after a download failure', async () => {
    const result = deferred();
    generate.mockImplementationOnce((request) => {
      request.prompt = '九宫格'; request.taskId = 'original-task';
      return result.promise;
    });
    const run = Render().generate();
    expect(Render().stage).toBe('prompt');
    const onStage = generate.mock.calls[0][2];
    onStage('generating');
    expect(Render().stage).toBe('generating');
    onStage('cropping');
    expect(Render().stage).toBe('cropping');
    result.reject(new Error('读取原图超时'));
    await run;
    expect(Render().stage).toBe('');
    expect(Render().active).toEqual([]);
    expect(Render().recovering).toBe(true);
    expect(Render().notice).toContain('视角图已生成');
    expect(Render().error).toContain('读取原图超时');
    generate.mockResolvedValueOnce(generated);
    await Render().generate();
    expect(generate.mock.calls[1][0]).toBe(generate.mock.calls[0][0]);
    expect(Render().missing).toEqual([]);
    expect(Render().error).toBe('');
  });
  it('keeps uploaded views and recovers a removed view from cached crops without generation', async () => {
    vi.mocked(uploadSalesViewImage).mockResolvedValueOnce('/manual-face.jpg');
    await Render().upload('face', new File(['png'], 'face.png', { type: 'image/png' }));
    generate.mockResolvedValueOnce(generated);
    await Render().generate();
    expect(Render().views.face).toBe('/manual-face.jpg');
    expect(Render().views.main).toBe('/main.jpg');
    Render().remove('side');
    expect(Render().reusable).toBe(true);
    await Render().generate();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(Render().views.side).toBe('/side.jpg');
    expect(Render().notice).toContain('已恢复 1 张');
  });
  it('invalidates the old grid when replacing the main reference', async () => {
    generate.mockResolvedValue(generated);
    await Render().generate();
    const previous = generate.mock.calls[0][0];
    vi.mocked(uploadSalesViewImage).mockResolvedValueOnce('/new-main.jpg');
    await Render().upload('main', new File(['png'], 'main.png', { type: 'image/png' }));
    Render().remove('side');
    expect(Render().reusable).toBe(false);
    await Render().generate();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].key).not.toBe(previous.key);
    expect(generate.mock.calls[1][0].references[0]).toBe('/new-main.jpg');
  });
  it('aborts on unmount and ignores late results', async () => {
    const result = deferred();
    generate.mockReturnValueOnce(result.promise);
    const run = Render().generate();
    hooks.cleanup?.();
    expect(generate.mock.calls[0][1].aborted).toBe(true);
    result.resolve(generated);
    await run;
    expect(Render().views).toEqual({ ...readPersonaViews().views, main: '/main.jpg' });
  });
  it('does not apply an incomplete crop response over existing references', async () => {
    generate.mockImplementationOnce(async (request) => { request.resultUrl = '/grid.png'; return { face: '/face.jpg' }; });
    await Render().generate();
    expect(Render().error).toContain('生成视角不完整');
    expect(Render().views.face).toBe('');
    expect(Render().recovering).toBe(true);
  });
  it('retries a missing prompt as a new request with the latest model and references', async () => {
    generate.mockRejectedValueOnce(new Error('当前后端尚未加载九宫格提示词'));
    await Render().generate();
    const previous = generate.mock.calls[0][0];
    expect(Render().recovering).toBe(false);
    expect(Render().error).toContain('九宫格提示词');
    Render().setModel('new-model');
    vi.mocked(uploadSalesViewImage).mockResolvedValueOnce('/manual-face.jpg');
    await Render().upload('face', new File(['png'], 'face.png', { type: 'image/png' }));
    generate.mockResolvedValueOnce(generated);
    await Render().generate();
    expect(generate.mock.calls[1][0]).toMatchObject({ model: 'new-model', references: ['/main.jpg', '/manual-face.jpg'] });
    expect(generate.mock.calls[1][0].key).not.toBe(previous.key);
    expect(Render().views.face).toBe('/manual-face.jpg');
  });
  it('keeps the frozen request after submission may have reached the image service', async () => {
    generate.mockImplementationOnce(async (request) => { request.prompt = '九宫格'; throw new Error('网络中断'); });
    await Render().generate();
    const previous = generate.mock.calls[0][0];
    expect(Render().recovering).toBe(true);
    generate.mockResolvedValueOnce(generated);
    await Render().generate();
    expect(generate.mock.calls[1][0]).toBe(previous);
  });
});


function savedDraft(initial: SalesAssetDraft | null = null): SalesAssetDraftPersistence {
  return {
    saved: initial,
    update(patch) { this.saved = JSON.parse(JSON.stringify({ fields: {}, ...this.saved, ...patch })); return true; },
  };
}
function remount() { hooks.cleanup?.(); hooks.cleanup = undefined; hooks.slots = []; }

it('restores uploaded and generated references after the dialog is unmounted', async () => {
  const draft = savedDraft();
  vi.mocked(uploadSalesViewImage).mockResolvedValueOnce('/user-main.jpg');
  await Render(draft).upload('main', new File(['png'], 'main.png', { type: 'image/png' }));
  generate.mockResolvedValueOnce(generated);
  await Render(draft).generate();
  remount();
  const restored = Render(draft);
  expect(restored.views).toEqual({ sheet: '', main: '/user-main.jpg', ...generated });
  expect(restored.missing).toEqual([]);
  expect(generate).toHaveBeenCalledTimes(1);
});

it('persists the key before submission and restores the same interrupted paid task', async () => {
  const draft = savedDraft();
  const result = deferred();
  generate.mockImplementationOnce((request, _signal, _stage, onProgress) => {
    expect(draft.saved?.request?.key).toBe(request.key);
    request.prompt = 'paid prompt'; request.taskId = 'paid-task'; onProgress();
    return result.promise;
  });
  const run = Render(draft).generate();
  const original = generate.mock.calls[0][0];
  expect(draft.saved?.request).toMatchObject({ key: original.key, taskId: 'paid-task' });
  remount();
  result.resolve(generated); await run;
  expect(Render(draft).recovering).toBe(true);
  generate.mockResolvedValueOnce(generated);
  await Render(draft).generate();
  expect(generate.mock.calls[1][0]).toMatchObject({ key: original.key, taskId: 'paid-task', prompt: 'paid prompt', model: 'test' });
  expect(Render(draft).views).toEqual({ sheet: '', main: '/main.jpg', ...generated });
});

it('does not submit a paid request when its recovery data cannot be saved', async () => {
  const draft = { saved: null, update: () => false };
  await Render(draft).generate();
  expect(generate).not.toHaveBeenCalled();
  expect(Render(draft).active).toEqual([]);
});

it('retains historical unlabelled references when the restored draft only contains fields', () => {
  const draft = savedDraft({ fields: { name: 'edited' } });
  hooks.index = 0;
  const photos = useSalesAssetViews({
    initial: () => ({ views: readPersonaViews().views, extraImages: ['/historical.jpg'] }),
    draft, definitions: PERSONA_VIEWS, referenceKeys: ['main'], prefix: 'persona-view', generate,
  });
  expect(photos.extraImages).toEqual(['/historical.jpg']);
});

it('recovers after effect replay without losing the task or letting an old request unlock a newer one', async () => {
  const first = deferred(); const second = deferred();
  generate.mockImplementationOnce((request, _signal, onStage) => {
    request.taskId = 'original-paid-task'; onStage('generating'); return first.promise;
 }).mockReturnValueOnce(second.promise);
  const firstRun = Render().generate();
  expect(Render().active).toHaveLength(4);
  // Fast Refresh runs cleanup and setup with the SAME hook state and refs.
  hooks.cleanup?.(); hooks.cleanup = undefined; Render();
  expect(Render().active).toEqual([]);
  expect(Render().stage).toBe('');
  expect(Render().recovering).toBe(true);
  const secondRun = Render().generate();
  expect(generate.mock.calls[1][0].taskId).toBe('original-paid-task');
  first.resolve(generated); await firstRun;
  expect(Render().active).toHaveLength(4);
  await Render().generate();
  expect(generate).toHaveBeenCalledTimes(2);
  second.resolve(generated); await secondRun;
  expect(Render().active).toEqual([]);
  expect(Render().views).toEqual({ sheet: '', main: '/main.jpg', ...generated });
});

it('recovers an interrupted upload after effect replay and ignores its late result', async () => {
  let finishFirst!: (url: string) => void;
  let finishSecond!: (url: string) => void;
  vi.mocked(uploadSalesViewImage).mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }))
    .mockReturnValueOnce(new Promise((resolve) => { finishSecond = resolve; }));
  const file = new File(['png'], 'main.png', { type: 'image/png' });
  const first = Render().upload('main', file);
  hooks.cleanup?.(); hooks.cleanup = undefined; Render();
  expect(Render().active).toEqual([]);
  const second = Render().upload('main', file);
  finishFirst('/old.jpg'); await first;
  expect(Render().active).toEqual(['main']);
  expect(Render().views.main).toBe('/main.jpg');
  await Render().upload('main', file);
  expect(uploadSalesViewImage).toHaveBeenCalledTimes(2);
  finishSecond('/new.jpg'); await second;
  expect(Render().active).toEqual([]);
  expect(Render().views.main).toBe('/new.jpg');
});
