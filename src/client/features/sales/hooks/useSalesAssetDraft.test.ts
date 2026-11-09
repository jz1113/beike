import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { submitSalesAssetJob } from '../api/salesAssetJobs';
import { PERSONA_VIEWS, readPersonaViews } from '../model/salesActionViews';
import {
  readSalesAssetDraft,
  salesAssetDraftKey,
  type SalesAssetDraft,
  type SalesAssetDraftPersistence,
} from '../model/salesAssetDraft';
import { useSalesAssetDraft, useSalesAssetViews } from './useSalesAssetViews';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], cleanup: undefined as (() => void) | undefined, workspace: 'workspace' }));
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
    return [hooks.slots[index], (next: T) => { hooks.slots[index] = next; }];
  },
}));
vi.mock('@client/shared/api/workspaceClient', () => ({ getWorkspaceSecret: () => hooks.workspace }));
vi.mock('../api/salesAssetJobs', () => ({ submitSalesAssetJob: vi.fn() }));
vi.mock('@client/shared/api/generation/seedancePrecheck', () => ({ runSeedancePrecheck: vi.fn() }));
vi.mock('@client/shared/models/configuredModels', () => ({ loadSystemConfiguredModels: () => ({ selectedImageGenModel: 'test', availableImageModels: [{ id: 'test' }] }) }));

let values: Map<string, string>;
const setItem = vi.fn();
const addEventListener = vi.fn();
const onQueued = vi.fn();
const foregroundGenerate = vi.fn();
let draftPersistence: SalesAssetDraftPersistence;

function Render(kind: 'persona' | 'scene' = 'persona', id?: string) {
  hooks.index = 0;
  return useSalesAssetDraft(kind, id, { name: '', group: 'female', voiceId: '' });
}
function RenderBackground(enabled = true) {
  hooks.index = 0;
  return useSalesAssetViews({
    initial: () => ({ views: { ...readPersonaViews().views, main: '/main.jpg' }, extraImages: [] }),
    definitions: PERSONA_VIEWS, referenceKeys: ['main', 'face'], prefix: 'persona-grid', draft: draftPersistence, generate: foregroundGenerate,
    background: { kind: 'persona', assetId: 'persona-1', enabled, data: (views) => ({ name: '人物1', main: views.main }), onQueued },
  });
}
function unmount() { hooks.cleanup?.(); hooks.slots = []; hooks.cleanup = undefined; }

beforeEach(() => {
  hooks.slots = []; hooks.cleanup = undefined; hooks.workspace = 'workspace'; values = new Map(); vi.resetAllMocks();
  setItem.mockImplementation((key: string, value: string) => { values.set(key, value); });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem, removeItem: (key: string) => values.delete(key) });
  vi.stubGlobal('window', { addEventListener, removeEventListener: vi.fn() });
  draftPersistence = { saved: null, update(patch) { this.saved = structuredClone({ fields: {}, ...this.saved, ...patch }); return true; } };
});
afterEach(() => { unmount(); vi.unstubAllGlobals(); });

it('synchronously retains typed fields and asynchronous image progress after closing and reopening', () => {
  const initial = Render();
  expect(initial.status).toBe('idle');
  initial.setField('name', '新人物');
  expect(Render().status).toBe('saved');
  Render().setField('voiceId', '声音');
  initial.update({ views: { main: '/uploaded.jpg' }, request: { key: 'paid-once', model: 'm', references: ['/uploaded.jpg'], taskId: 'task' } });
  unmount();
  const restored = Render();
  expect(restored.restored).toBe(true);
  expect(restored.status).toBe('restored');
  expect(restored.fields).toMatchObject({ name: '新人物', voiceId: '声音' });
  expect(restored.saved).toMatchObject({ views: { main: '/uploaded.jpg' }, request: { key: 'paid-once', taskId: 'task' } });
});

it('removes only the completed asset draft after a confirmed save', () => {
  Render().setField('name', 'new');
  const unrelated = salesAssetDraftKey('other-workspace', 'persona'); values.set(unrelated, 'keep');
  expect(Render().clear()).toBe(true);
  expect(Render().status).toBe('idle');
  expect(readSalesAssetDraft(salesAssetDraftKey('workspace', 'persona'))).toBeNull();
  expect(values.get(unrelated)).toBe('keep');
  unmount(); expect(Render().restored).toBe(false);
});

it('keeps unsaved state in memory and warns before unload when storage fails, then retries', () => {
  setItem.mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  Render().setField('name', '不能丢');
  expect(Render().fields.name).toBe('不能丢');
  expect(Render().error).toContain('保存失败');
  expect(Render().status).toBe('error');
  expect(Render().flush()).toBe(false);
  const event = { preventDefault: vi.fn(), returnValue: undefined };
  addEventListener.mock.calls[0][1](event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  setItem.mockImplementation((key: string, value: string) => values.set(key, value));
  expect(Render().flush()).toBe(true);
  expect(Render().error).toBe('');
  expect(Render().status).toBe('saved');
  unmount(); expect(Render().fields.name).toBe('不能丢');
});

it('checkpoints the key then queues the selected model and metadata, without waiting in the browser for generation', async () => {
  vi.mocked(submitSalesAssetJob).mockImplementationOnce(async (_kind, request) => {
    expect(draftPersistence.saved?.request?.key).toBe(request.key);
    request.assetId = 'persona-1'; request.jobId = 'job-1';
    return { id: 'job-1', key: request.key, kind: 'persona', assetId: 'persona-1', model: 'test', status: 'queued', error: '', images: {}, createdAt: '', updatedAt: '' };
  });
  await RenderBackground().generate();
  expect(submitSalesAssetJob).toHaveBeenCalledWith('persona', expect.objectContaining({ model: 'test', references: ['/main.jpg'] }), { name: '人物1', main: '/main.jpg' }, 'persona-1', expect.any(AbortSignal));
  expect(foregroundGenerate).not.toHaveBeenCalled();
  expect(onQueued).toHaveBeenCalledOnce();
  expect(draftPersistence.saved?.request).toMatchObject({ jobId: 'job-1', assetId: 'persona-1' });
  expect(RenderBackground().savedAssetId).toBe('persona-1');
  expect(RenderBackground().unconfirmedBackground).toBe(false);
  expect(RenderBackground().active).toEqual([]);
});

it('keeps the same key after a lost queue response so retry reconciles the existing backend task', async () => {
  vi.mocked(submitSalesAssetJob).mockRejectedValue(new Error('网络中断'));
  await RenderBackground().generate();
  const original = structuredClone(draftPersistence.saved?.request);
  await RenderBackground().generate();
  expect(submitSalesAssetJob).toHaveBeenCalledTimes(2);
  expect(vi.mocked(submitSalesAssetJob).mock.calls[1][1].key).toBe(original?.key);
  expect(RenderBackground().error).toBe('网络中断');
  expect(RenderBackground().unconfirmedBackground).toBe(true);
  expect(onQueued).not.toHaveBeenCalled();
});

it('requires a name and a persisted recovery checkpoint before queuing', async () => {
  await RenderBackground(false).generate();
  expect(submitSalesAssetJob).not.toHaveBeenCalled();
  draftPersistence.update = () => false;
  await RenderBackground().generate();
  expect(submitSalesAssetJob).not.toHaveBeenCalled();
});

it('carries legacy paid-task checkpoints into the backend job instead of creating a fresh generation', async () => {
  draftPersistence.saved = { fields: {}, request: { key: 'old-key', model: 'test', references: ['/main.jpg'], taskId: 'paid-task', resultUrl: '/grid.jpg' } } satisfies SalesAssetDraft;
  vi.mocked(submitSalesAssetJob).mockRejectedValue(new Error('保存暂不可用'));
  await RenderBackground().generate();
  expect(submitSalesAssetJob).toHaveBeenCalledWith('persona', expect.objectContaining({ key: 'old-key', taskId: 'paid-task', resultUrl: '/grid.jpg' }), expect.any(Object), 'persona-1', expect.any(AbortSignal));
  expect(foregroundGenerate).not.toHaveBeenCalled();
});
