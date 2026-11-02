import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { submitSalesAssetJob } from '../api/salesAssetJobs';
import { readPersonaViews, PERSONA_VIEWS } from '../model/salesPersonaViews';
import type { SalesAssetDraft, SalesAssetDraftPersistence } from '../model/salesAssetDraft';
import { useSalesAssetViews } from './useSalesAssetViews';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], cleanup: undefined as (() => void) | undefined }));
vi.mock('react', () => ({
  useEffect: (fn: () => (() => void)) => { if (!hooks.cleanup) hooks.cleanup = fn(); },
  useRef: (value: unknown) => { const index = hooks.index++; return hooks.slots[index] ||= { current: value }; },
  useState: <T>(value: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof value === 'function' ? (value as () => T)() : value;
    return [hooks.slots[index], (next: T) => { hooks.slots[index] = next; }];
  },
}));
vi.mock('../api/salesAssetJobs', () => ({ submitSalesAssetJob: vi.fn() }));
vi.mock('@client/shared/api/generation/seedancePrecheck', () => ({ runSeedancePrecheck: vi.fn() }));
vi.mock('@client/shared/models/configuredModels', () => ({ loadSystemConfiguredModels: () => ({ selectedImageGenModel: 'test', availableImageModels: [{ id: 'test' }] }) }));
const onQueued = vi.fn(); const foregroundGenerate = vi.fn();
let draft: SalesAssetDraftPersistence;
function Render(enabled = true) {
  hooks.index = 0;
  return useSalesAssetViews({
    initial: () => ({ views: { ...readPersonaViews().views, main: '/main.jpg' }, extraImages: [] }),
    definitions: PERSONA_VIEWS, referenceKeys: ['main', 'face'], prefix: 'persona-grid', draft, generate: foregroundGenerate,
    background: { kind: 'persona', assetId: 'persona-1', enabled, data: (views) => ({ name: '人物1', main: views.main }), onQueued },
  });
}
beforeEach(() => {
  hooks.slots = []; hooks.cleanup = undefined; vi.clearAllMocks();
  draft = { saved: null, update(patch) { this.saved = structuredClone({ fields: {}, ...this.saved, ...patch }); return true; } };
});
afterEach(() => hooks.cleanup?.());

it('checkpoints the key then queues the selected model and metadata, without waiting in the browser for generation', async () => {
  vi.mocked(submitSalesAssetJob).mockImplementationOnce(async (_kind, request) => {
    expect(draft.saved?.request?.key).toBe(request.key);
    request.assetId = 'persona-1'; request.jobId = 'job-1';
    return { id: 'job-1', key: request.key, kind: 'persona', assetId: 'persona-1', model: 'test', status: 'queued', error: '', images: {}, createdAt: '', updatedAt: '' };
  });
  await Render().generate();
  expect(submitSalesAssetJob).toHaveBeenCalledWith('persona', expect.objectContaining({ model: 'test', references: ['/main.jpg'] }), { name: '人物1', main: '/main.jpg' }, 'persona-1', expect.any(AbortSignal));
  expect(foregroundGenerate).not.toHaveBeenCalled();
  expect(onQueued).toHaveBeenCalledOnce();
  expect(draft.saved?.request).toMatchObject({ jobId: 'job-1', assetId: 'persona-1' });
  expect(Render().savedAssetId).toBe('persona-1');
  expect(Render().unconfirmedBackground).toBe(false);
  expect(Render().active).toEqual([]);
});

it('keeps the same key after a lost queue response so retry reconciles the existing backend task', async () => {
  vi.mocked(submitSalesAssetJob).mockRejectedValue(new Error('网络中断'));
  await Render().generate();
  const original = structuredClone(draft.saved?.request);
  await Render().generate();
  expect(submitSalesAssetJob).toHaveBeenCalledTimes(2);
  expect(vi.mocked(submitSalesAssetJob).mock.calls[1][1].key).toBe(original?.key);
  expect(Render().error).toBe('网络中断');
  expect(Render().unconfirmedBackground).toBe(true);
  expect(onQueued).not.toHaveBeenCalled();
});

it('requires a name and a persisted recovery checkpoint before queuing', async () => {
  await Render(false).generate();
  expect(submitSalesAssetJob).not.toHaveBeenCalled();
  draft.update = () => false;
  await Render().generate();
  expect(submitSalesAssetJob).not.toHaveBeenCalled();
});

it('carries legacy paid-task checkpoints into the backend job instead of creating a fresh generation', async () => {
  draft.saved = { fields: {}, request: { key: 'old-key', model: 'test', references: ['/main.jpg'], taskId: 'paid-task', resultUrl: '/grid.jpg' } } satisfies SalesAssetDraft;
  vi.mocked(submitSalesAssetJob).mockRejectedValue(new Error('保存暂不可用'));
  await Render().generate();
  expect(submitSalesAssetJob).toHaveBeenCalledWith('persona', expect.objectContaining({ key: 'old-key', taskId: 'paid-task', resultUrl: '/grid.jpg' }), expect.any(Object), 'persona-1', expect.any(AbortSignal));
  expect(foregroundGenerate).not.toHaveBeenCalled();
});
