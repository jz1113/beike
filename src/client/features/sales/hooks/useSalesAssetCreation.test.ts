import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SalesAssetViewJob } from '@shared/contracts/salesAssetViews';
import { readSalesAssetJob, submitSalesAssetJob, waitSalesAssetJob } from '../api/salesAssetJobs';
import { uploadSalesViewImage } from '../api/salesAssetViews';
import type { SalesAssetDraftPersistence } from '../model/salesAssetDraft';
import type { SalesAssetCreation } from '../model/salesAssetCreation';
import type { AssetViewRequest } from '../model/salesAssetViews';
import { PERSONA_SHEET_VIEWS, readPersonaViews } from '../model/salesPersonaViews';
import { SCENE_VIEWS, readSceneViews } from '../model/salesSceneViews';
import { useSalesAssetViews } from './useSalesAssetViews';

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
vi.mock('../api/salesAssetJobs', () => ({ readSalesAssetJob: vi.fn(), submitSalesAssetJob: vi.fn(), waitSalesAssetJob: vi.fn() }));
vi.mock('../api/salesAssetViews', () => ({ uploadSalesViewImage: vi.fn() }));
vi.mock('@client/shared/api/generation/seedancePrecheck', () => ({ runSeedancePrecheck: vi.fn() }));
vi.mock('@client/shared/models/configuredModels', () => ({ loadSystemConfiguredModels: () => ({ selectedVisionModel: 'vision', selectedImageGenModel: 'image', availableImageModels: [{ id: 'image' }] }) }));
vi.mock('../model/salesAssetModels', () => ({ supportsSalesAssetReferences: () => true }));

let options: Parameters<typeof useSalesAssetViews<string>>[0];
let draft: SalesAssetDraftPersistence;
const onQueued = vi.fn();
const foregroundGenerate = vi.fn();
let submitted: AssetViewRequest[];
const creation: SalesAssetCreation = {
  referenceImageUrl: '/reference.jpg', prompt: '自然光下的全新形象', imageUrl: '/generated-main.jpg', promptModel: 'vision', imageModel: 'image',
};
function setup(kind: 'persona' | 'scene' = 'persona', initial: Record<string, string> = {}, existingCreation?: SalesAssetCreation, creationMode = true) {
  const definitions = kind === 'persona' ? PERSONA_SHEET_VIEWS : SCENE_VIEWS;
  options = {
    draft, initial: () => ({ views: { ...(kind === 'persona' ? readPersonaViews().views : readSceneViews().views), ...initial }, extraImages: ['/old-extra.jpg'] }),
    creationMode, creation: existingCreation, definitions, referenceKeys: kind === 'persona' ? ['main', 'face'] : ['main', 'left', 'right'],
    prefix: `${kind}-grid`, generate: foregroundGenerate,
    background: {
      kind, enabled: true, waitForResult: true, onQueued,
      data: (views, extraImages) => ({ name: '新资产', coverUrl: views.main, sourceImages: JSON.stringify([...Object.values(views), ...extraImages].filter(Boolean)), dimensions: JSON.stringify({ retained: 'metadata' }) }),
    },
  };
}
function Render() { hooks.index = 0; return useSalesAssetViews(options); }
function images() { return Object.fromEntries(options.definitions.filter(({ id }) => id !== 'main').map(({ id }) => [id, `/generated-${id}.jpg`])); }
function job(status: SalesAssetViewJob['status'], patch: Partial<SalesAssetViewJob> = {}): SalesAssetViewJob {
  return { id: 'job-1', key: 'key', kind: options.background!.kind, assetId: 'asset-1', model: 'image', status, error: '', images: {}, createdAt: '', updatedAt: '', ...patch };
}
function queueAndComplete(result: Partial<SalesAssetViewJob> = {}) {
  vi.mocked(submitSalesAssetJob).mockImplementation(async (_kind, request, _data, assetId) => {
    submitted.push(structuredClone(request));
    const queued = job('queued', { key: request.key, assetId: request.assetId || assetId || 'asset-1', creation: request.creation });
    request.jobId = queued.id; request.assetId = queued.assetId;
    if (queued.creation) request.creation = queued.creation;
    return queued;
  });
  vi.mocked(waitSalesAssetJob).mockImplementation(async (initial, _signal, progress) => {
    progress(initial);
    const completed = { ...initial, status: 'completed' as const, images: images(), ...result };
    progress(completed);
    return completed;
  });
}
beforeEach(() => {
  hooks.slots = []; hooks.cleanup = undefined; vi.clearAllMocks();
  submitted = [];
  draft = { saved: null, update(patch) { this.saved = structuredClone({ fields: {}, ...this.saved, ...patch }); return true; } };
  setup();
});
afterEach(() => hooks.cleanup?.());

it('replaces the reference without retaining the previous generated main, angles, prompt, or extra images', async () => {
  setup('persona', { main: '/previous-main.jpg', face: '/previous-face.jpg', front: '/previous-front.jpg' }, creation);
  vi.mocked(uploadSalesViewImage).mockResolvedValueOnce('/new-reference.jpg');
  const file = new File(['reference'], 'reference.png', { type: 'image/png' });
  await Render().uploadReference(file);
  expect(uploadSalesViewImage).toHaveBeenCalledWith(file, file.name, expect.any(AbortSignal));
  expect(Render().referenceUrl).toBe('/new-reference.jpg');
  expect(Object.values(Render().views).every((value) => !value)).toBe(true);
  expect(Render().extraImages).toEqual([]);
  expect(Render().creation).toEqual({ referenceImageUrl: '/new-reference.jpg' });
  expect(draft.saved).toMatchObject({ views: readPersonaViews().views, extraImages: [], creation: { referenceImageUrl: '/new-reference.jpg' }, request: null });
});

it.each(['persona', 'scene'] as const)('submits a %s reference with the selected vision model, then displays the generated main, prompt, and views', async (kind) => {
  setup(kind);
  vi.mocked(uploadSalesViewImage).mockResolvedValueOnce('/reference.jpg');
  await Render().uploadReference(new File(['reference'], 'reference.jpg', { type: 'image/jpeg' }));
  queueAndComplete({ creation });
  await Render().generate();
  expect(submitted[0]).toMatchObject({ analysisModel: 'vision', model: 'image', references: ['/reference.jpg'], creation: { referenceImageUrl: '/reference.jpg' } });
  expect(submitted[0].creation?.imageUrl).toBeUndefined();
  expect(submitted[0].creation?.prompt).toBeUndefined();
  expect(submitSalesAssetJob).toHaveBeenCalledWith(kind, expect.any(Object),
    expect.objectContaining({ coverUrl: '', sourceImages: '[]' }), undefined, expect.any(AbortSignal));
  const submittedData = vi.mocked(submitSalesAssetJob).mock.calls[0][2];
  expect(JSON.parse(submittedData.dimensions as string)).toEqual({ retained: 'metadata', assetCreation: { referenceImageUrl: '/reference.jpg' } });
  expect(waitSalesAssetJob).toHaveBeenCalledOnce();
  expect(Render().views).toEqual({ ...(kind === 'persona' ? readPersonaViews().views : {}), main: creation.imageUrl, ...images() });
  expect(Render().creation).toEqual(creation);
  expect(JSON.parse(Render().withCreationDimensions('{"retained":true}'))).toEqual({ retained: true, assetCreation: creation });
  expect(Render().savedAssetId).toBe('asset-1');
  expect(Render().unconfirmedBackground).toBe(false);
  expect(foregroundGenerate).not.toHaveBeenCalled();
});

it('supplements an existing generated asset from its main image without starting another main image request', async () => {
  setup('persona', { main: creation.imageUrl!, face: '/manual-face.jpg' }, creation);
  options.background!.assetId = 'existing-asset';
  queueAndComplete();
  await Render().generate();
  const request = vi.mocked(submitSalesAssetJob).mock.calls[0][1];
  expect(request).toMatchObject({ assetId: 'existing-asset', references: [creation.imageUrl, '/manual-face.jpg'] });
  expect(request.creation).toBeUndefined();
  expect(request.analysisModel).toBeUndefined();
  expect(Render().views.main).toBe(creation.imageUrl);
  expect(Render().views.face).toBe('/manual-face.jpg');
  expect(Render().creation).toEqual(creation);
});

it('keeps manual images while waiting for the remaining legacy asset views', async () => {
  setup('persona', { main: '/legacy-main.jpg', face: '/manual-face.jpg', side: '/manual-side.jpg' }, undefined, false);
  options.background!.assetId = 'legacy-asset';
  queueAndComplete();
  let finish!: () => void;
  vi.mocked(waitSalesAssetJob).mockImplementationOnce((initial, _signal, progress) => new Promise((resolve) => {
    progress(initial);
    finish = () => {
      const completed = { ...initial, status: 'completed' as const, images: images() };
      progress(completed); resolve(completed);
    };
  }));
  const run = Render().generate();
  await vi.waitFor(() => expect(waitSalesAssetJob).toHaveBeenCalledOnce());
  expect(Render().active).not.toContain('face');
  expect(Render().active).not.toContain('side');
  expect(Render().views.face).toBe('/manual-face.jpg');
  expect(Render().views.side).toBe('/manual-side.jpg');
  finish(); await run;
  expect(waitSalesAssetJob).toHaveBeenCalledOnce();
  expect(Render().views).toEqual({ ...readPersonaViews().views, main: '/legacy-main.jpg', ...images(), face: '/manual-face.jpg', side: '/manual-side.jpg' });
  expect(Render().creation).toBeUndefined();
  expect(vi.mocked(submitSalesAssetJob).mock.calls[0][1].creation).toBeUndefined();
});

it('retains the asset identity when a completed new asset receives another reference', async () => {
  vi.mocked(uploadSalesViewImage).mockResolvedValueOnce('/reference.jpg').mockResolvedValueOnce('/second-reference.jpg');
  await Render().uploadReference(new File(['reference'], 'reference.jpg', { type: 'image/jpeg' }));
  queueAndComplete({ creation });
  await Render().generate();
  const firstKey = vi.mocked(submitSalesAssetJob).mock.calls[0][1].key;
  await Render().uploadReference(new File(['second'], 'second.jpg', { type: 'image/jpeg' }));
  expect(Render().savedAssetId).toBe('asset-1');
  expect(draft.saved?.assetId).toBe('asset-1');
  queueAndComplete({ creation: { ...creation, referenceImageUrl: '/second-reference.jpg', imageUrl: '/second-main.jpg' } });
  await Render().generate();
  const second = vi.mocked(submitSalesAssetJob).mock.calls[1];
  expect(second[1].key).not.toBe(firstKey);
  expect(second[1]).toMatchObject({ assetId: 'asset-1', references: ['/second-reference.jpg'], analysisModel: 'vision' });
  expect(second[3]).toBe('asset-1');
  expect(Render().views.main).toBe('/second-main.jpg');
});

it('reopens a partial library asset using its original job key and model', async () => {
  const partialCreation = { referenceImageUrl: '/reference.jpg', prompt: '已保存的绘图提示词', promptModel: 'vision' };
  setup('persona', {}, partialCreation);
  options.jobId = 'library-job';
  options.background!.assetId = 'library-asset';
  vi.mocked(readSalesAssetJob).mockResolvedValueOnce(job('creating', {
    id: 'library-job', key: 'original-paid-key', assetId: 'library-asset', model: 'original-model', creation: partialCreation,
  }));
  queueAndComplete({ creation });
  await Render().generate();
  expect(readSalesAssetJob).toHaveBeenCalledWith('library-job', expect.any(AbortSignal));
  expect(submitted[0]).toMatchObject({ key: 'original-paid-key', jobId: 'library-job', assetId: 'library-asset', model: 'original-model', creation: partialCreation });
  expect(Render().views.main).toBe(creation.imageUrl);
  expect(Render().savedAssetId).toBe('library-asset');
  expect(draft.saved?.request?.key).toBe('original-paid-key');
});

it('protects an uncertain queue receipt from reference changes until its original request is reconciled', async () => {
  vi.mocked(uploadSalesViewImage).mockResolvedValueOnce('/reference.jpg').mockResolvedValueOnce('/second-reference.jpg');
  await Render().uploadReference(new File(['reference'], 'reference.jpg', { type: 'image/jpeg' }));
  vi.mocked(submitSalesAssetJob).mockRejectedValueOnce(new Error('网络中断'));
  await Render().generate();
  const originalKey = draft.saved?.request?.key;
  expect(Render().unconfirmedBackground).toBe(true);
  await Render().uploadReference(new File(['second'], 'second.jpg', { type: 'image/jpeg' }));
  Render().removeReference();
  expect(uploadSalesViewImage).toHaveBeenCalledOnce();
  expect(Render().referenceUrl).toBe('/reference.jpg');
  expect(Render().error).toContain('确认原任务');
  expect(draft.saved?.request?.key).toBe(originalKey);
  queueAndComplete({ creation });
  await Render().generate();
  expect(submitted[0].key).toBe(originalKey);
  expect(Render().unconfirmedBackground).toBe(false);
  await Render().uploadReference(new File(['second'], 'second.jpg', { type: 'image/jpeg' }));
  expect(uploadSalesViewImage).toHaveBeenCalledTimes(2);
  expect(Render().referenceUrl).toBe('/second-reference.jpg');
  expect(Render().savedAssetId).toBe('asset-1');
});
