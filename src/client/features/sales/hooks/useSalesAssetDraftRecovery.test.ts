import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { SalesAssetViewJob } from '@shared/contracts/salesAssetViews';
import type { SalesStudioAssetCatalog } from '../api/salesProduction';
import { readSalesAssetDraft, salesAssetDraftKey, writeSalesAssetDraft, type SalesAssetDraft } from '../model/salesAssetDraft';
import { useSalesAssetDraftRecovery } from './useSalesAssetDraftRecovery';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', () => ({ useState: <T>(initial: T | (() => T)) => {
  const index = hooks.index++;
  if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
  return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
    hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
  }];
} }));
vi.mock('@client/shared/utils/confirmAction', () => ({ confirmAction: vi.fn() }));
vi.mock('@client/shared/api/workspaceClient', () => ({ getWorkspaceSecret: () => 'workspace' }));

let values: Map<string, string>;
let catalog: SalesStudioAssetCatalog;
let ready: boolean;
const key = salesAssetDraftKey('workspace', 'persona');
const draft: SalesAssetDraft = { fields: { name: '女2' }, assetId: 'persona-2',
  request: { key: 'submitted-key', model: 'image', references: ['/reference.jpg'], jobId: 'job-2', assetId: 'persona-2' } };
const completed: SalesAssetViewJob = { id: 'job-2', key: 'submitted-key', kind: 'persona', assetId: 'persona-2', model: 'image', status: 'completed',
  images: { face: '/face.jpg' }, error: '', createdAt: '', updatedAt: '', creation: { referenceImageUrl: '/reference.jpg', imageUrl: '/main.jpg' } };
function Render() { hooks.index = 0; return useSalesAssetDraftRecovery('persona', catalog, ready); }
function addPersona() { catalog.personas.push({ id: 'persona-2', name: '女2', description: '', tags: '女', avatarUrl: '/main.jpg',
  faceUrl: '/face.jpg', fullBodyUrl: '', hasReferenceImage: true, sourceImages: ['/main.jpg'], source: 'persona_library' }); }

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; vi.clearAllMocks(); values = new Map(); ready = true;
  catalog = { personas: [], scenes: [], actions: [], voices: [], bgms: [] };
  vi.stubGlobal('localStorage', { getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); }, removeItem: (name: string) => { values.delete(name); } });
});
afterEach(() => vi.unstubAllGlobals());

it('waits for a successful catalog and job lookup before declaring a linked draft deleted', () => {
  writeSalesAssetDraft(key, draft);
  expect(Render()).toMatchObject({ checking: true, orphaned: false });
  Render().onJobsLoaded([completed]); ready = false;
  expect(Render()).toMatchObject({ checking: true, orphaned: false });
  ready = true;
  expect(Render()).toMatchObject({ title: '关联资产已删除的草稿', orphaned: true });
  expect(Render().prepare()).toBe(false);
  expect(readSalesAssetDraft(key)).toEqual(draft);
});

it('keeps an active submission recoverable until its asset appears in the next catalog refresh', () => {
  writeSalesAssetDraft(key, draft);
  Render().onJobsLoaded([{ ...completed, status: 'generating' }]);
  expect(Render()).toMatchObject({ title: '生成中的草稿', orphaned: false, checking: false });
});

it('recovers a lost receipt into the original asset and restores results without replacing edited fields', () => {
  addPersona();
  writeSalesAssetDraft(key, { fields: { name: '本机修改名称' }, creation: { referenceImageUrl: '/reference.jpg' },
    request: { key: 'submitted-key', model: 'image', references: ['/reference.jpg'] } });
  Render().onJobsLoaded([completed]);
  expect(Render()).toMatchObject({ title: '已入库资产的暂存编辑', persona: { id: 'persona-2' }, orphaned: false });
  expect(Render().prepare()).toBe(true);
  expect(readSalesAssetDraft(key)).toMatchObject({ assetId: 'persona-2', fields: { name: '本机修改名称' }, views: { main: '/main.jpg', face: '/face.jpg' },
    request: { key: 'submitted-key', jobId: 'job-2', assetId: 'persona-2', images: completed.images } });
});

it('recognizes a reference-only draft without requiring a name or generated main image', () => {
  writeSalesAssetDraft(key, { fields: { name: '' }, creation: { referenceImageUrl: '/uploaded.jpg' } });
  expect(Render()).toMatchObject({ hasDraft: true, title: '未入库草稿' });
});

it('discards only the selected local draft after confirmation and keeps all other drafts', async () => {
  writeSalesAssetDraft(key, draft);
  const otherKey = salesAssetDraftKey('other-workspace', 'persona');
  values.set(otherKey, 'keep');
  vi.mocked(confirmAction).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  expect(await Render().discard()).toBe(false);
  expect(readSalesAssetDraft(key)).toEqual(draft);
  expect(await Render().discard()).toBe(true);
  expect(readSalesAssetDraft(key)).toBeNull();
  expect(values.get(otherKey)).toBe('keep');
  expect(Render().hasDraft).toBe(false);
});

it('preserves a newer draft written while a discard confirmation was open', async () => {
  writeSalesAssetDraft(key, draft);
  vi.mocked(confirmAction).mockImplementationOnce(async () => { writeSalesAssetDraft(key, { fields: { name: '另一个窗口的新编辑' } }); return true; });
  expect(await Render().discard()).toBe(false);
  expect(readSalesAssetDraft(key)?.fields.name).toBe('另一个窗口的新编辑');
  expect(Render().error).toContain('草稿已更新');
});
