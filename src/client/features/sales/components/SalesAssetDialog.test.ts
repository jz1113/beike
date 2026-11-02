import { Children, isValidElement, type ComponentProps, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { atlasFaceItemSchema } from '@shared/contracts/salesAtlas';
import { fetchAtlasMediaAsFile } from '../api/salesAtlas';
import { createSalesMaterial, deleteSalesMaterial, updateSalesMaterial } from '../api/salesMaterials';
import { SalesPersonaDialog } from './SalesPersonaDialog';
import { SalesSceneDialog } from './SalesSceneDialog';
import { SalesAssetDraftStatus } from './SalesAssetDraftStatus';
import { AtlasHubDrawer } from './atlas/AtlasHubDrawer';

const draft = vi.hoisted(() => ({ clear: vi.fn(), status: 'saved' as const, fields: { name: '待保存', group: 'female', voiceId: '', space: 'indoor', tags: '' }, setField: vi.fn(), upload: vi.fn(), savedAssetId: undefined as string | undefined, unconfirmedBackground: false }));
const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], cleanup: undefined as (() => void) | undefined }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
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
vi.mock('@client/shared/utils/confirmAction', () => ({ confirmAction: vi.fn() }));
vi.mock('../api/salesMaterials', () => ({ createSalesMaterial: vi.fn(), updateSalesMaterial: vi.fn(), deleteSalesMaterial: vi.fn() }));
vi.mock('../api/salesAtlas', () => ({ fetchAtlasMediaAsFile: vi.fn() }));
vi.mock('../hooks/useSalesAssetDraft', () => ({ useSalesAssetDraft: () => ({
  fields: draft.fields, setField: draft.setField, clear: draft.clear, status: draft.status, flush: () => true, error: '',
}) }));
vi.mock('../hooks/useSalesPersonaViews', () => ({ useSalesPersonaViews: () => ({ views: { main: '/main.jpg' }, extraImages: [], active: [], upload: draft.upload, savedAssetId: draft.savedAssetId, unconfirmedBackground: draft.unconfirmedBackground }) }));
vi.mock('../hooks/useSalesSceneViews', () => ({ useSalesSceneViews: () => ({ views: { main: '/main.jpg' }, extraImages: [], active: [], savedAssetId: draft.savedAssetId, unconfirmedBackground: draft.unconfirmedBackground }) }));
const onSaved = vi.fn(); const onClose = vi.fn();
type Node = ReactElement<Record<string, unknown>>;
function Render(kind: 'persona' | 'scene', scene?: ComponentProps<typeof SalesSceneDialog>['scene']) {
  hooks.index = 0;
  return kind === 'persona' ? SalesPersonaDialog({ voices: [], onSaved, onClose }) : SalesSceneDialog({ scene, onSaved, onClose });
}
function find(root: Node, predicate: (node: Node) => boolean): Node {
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    if (predicate(node)) return node;
    Children.forEach(node.props.children as ReactElement, (child) => {
      if (isValidElement<Record<string, unknown>>(child)) queue.push(child);
    });
  }
  throw new Error('Control not found');
}
function submit(kind: 'persona' | 'scene') {
  (find(Render(kind), (node) => node.type === 'form').props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
}
function pending(kind: 'persona' | 'scene') { return find(Render(kind), (node) => node.type === 'button' && node.props.type === 'submit').props.disabled; }
beforeEach(() => { hooks.cleanup?.(); hooks.cleanup = undefined; hooks.slots = []; vi.clearAllMocks(); draft.clear.mockReturnValue(true); draft.fields.name = '待保存'; draft.fields.group = 'female'; draft.savedAssetId = undefined; draft.unconfirmedBackground = false; });

it.each(['male', 'female', 'senior', 'child'])('starts the atlas picker from %s and preserves that persona category when filling the main image', async (group) => {
  draft.fields.group = group; draft.fields.name = '';
  const root = Render('persona');
  (find(root, (node) => node.type === 'button' && Children.toArray(node.props.children as ReactElement).includes('从人像图鉴选主图')).props.onClick as () => void)();
  const picker = find(Render('persona'), (node) => node.type === AtlasHubDrawer);
  expect(picker.props.defaultFaceAudience).toBe(group === 'male' ? 'adult_male' : 'adult_female');
  const file = new File(['image'], 'atlas.jpg', { type: 'image/jpeg' });
  vi.mocked(fetchAtlasMediaAsFile).mockResolvedValueOnce(file);
  const face = atlasFaceItemSchema.parse({ id: 'atlas', fullUrl: '/atlas.jpg' });
  await (picker.props.onPickPersonaFace as NonNullable<ComponentProps<typeof AtlasHubDrawer>['onPickPersonaFace']>)(face, '图鉴人物', group === 'male' ? 'female' : 'male');
  expect(draft.upload).toHaveBeenCalledExactlyOnceWith('main', file);
  expect(draft.setField).toHaveBeenCalledExactlyOnceWith('name', '图鉴人物');
  expect(draft.fields.group).toBe(group);
});

it.each(['persona', 'scene'] as const)('unlocks an interrupted %s save after effect replay and ignores its late completion', async (kind) => {
  let finishFirst!: () => void; let finishSecond!: () => void;
  vi.mocked(createSalesMaterial).mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }))
    .mockReturnValueOnce(new Promise((resolve) => { finishSecond = resolve; }));
  submit(kind);
  expect(pending(kind)).toBe(true);
  const signal = vi.mocked(createSalesMaterial).mock.calls[0][2]!;
  hooks.cleanup?.(); hooks.cleanup = undefined; Render(kind);
  expect(signal.aborted).toBe(true);
  expect(pending(kind)).toBe(false);
  expect(find(Render(kind), (node) => node.props.role === 'alert').props.children).toContain('操作已中断');
  submit(kind);
  finishFirst(); await Promise.resolve(); await Promise.resolve();
  expect(pending(kind)).toBe(true);
  expect(onSaved).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  submit(kind);
  expect(createSalesMaterial).toHaveBeenCalledTimes(2);
  finishSecond();
  await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(onClose).toHaveBeenCalledOnce();
});


it('removes the scene tag input while retaining existing user tags and the selected space on save', async () => {
  const scene: NonNullable<ComponentProps<typeof SalesSceneDialog>['scene']> = {
    id: 'scene', title: '已有场景', description: '', spatialType: 'indoor_room', tags: '室内，采光，木质', category: '', coverUrl: '/main.jpg', lighting: '', suitableCategories: [], sourceImages: [], source: 'scene_library',
  };
  const root = Render('scene', scene);
  expect(() => find(root, (node) => node.type === 'input' && node.props.placeholder === '选填，用逗号分隔')).toThrow();
  vi.mocked(updateSalesMaterial).mockResolvedValueOnce();
  (find(root, (node) => node.type === 'form').props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
  await vi.waitFor(() => expect(updateSalesMaterial).toHaveBeenCalledOnce());
  expect(updateSalesMaterial).toHaveBeenCalledWith('scene', 'scene', expect.objectContaining({ tags: '室内，采光，木质', spatialType: 'indoor_room' }), expect.any(AbortSignal));
});

it.each(['persona', 'scene'] as const)('discards a %s draft only after confirmation without deleting stored assets', async (kind) => {
  const status = () => find(Render(kind), (node) => node.type === SalesAssetDraftStatus);
  const discard = () => (status().props.onDiscard as () => void)();
  vi.mocked(confirmAction).mockResolvedValueOnce(false);
  discard(); await Promise.resolve();
  expect(draft.clear).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  vi.mocked(confirmAction).mockResolvedValueOnce(true);
  discard(); await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(draft.clear).toHaveBeenCalledOnce();
  expect(deleteSalesMaterial).not.toHaveBeenCalled();
});

it('keeps the draft open if clearing local storage fails', async () => {
  draft.clear.mockReturnValueOnce(false); vi.mocked(confirmAction).mockResolvedValueOnce(true);
  (find(Render('scene'), (node) => node.type === SalesAssetDraftStatus).props.onDiscard as () => void)();
  await vi.waitFor(() => expect(draft.clear).toHaveBeenCalledOnce());
  expect(onClose).not.toHaveBeenCalled();
});

it.each([
  ['idle', false, '尚未入库'], ['idle', true, '已入库'],
  ['restored', false, '已恢复草稿 · 未入库'], ['saved', true, '草稿已暂存 · 修改待保存'],
  ['error', false, '草稿暂存失败'],
] as const)('distinguishes %s status from a saved asset', (status, existing, label) => {
  const root = SalesAssetDraftStatus({ status, existing, busy: false, pending: false, onDiscard: vi.fn() });
  expect(find(root, (node) => node.props.role === 'status').props.children).toBe(label);
});


it('reports a successful library save with its draft cleanup warning instead of asking users to save again', async () => {
  draft.clear.mockReturnValueOnce(false); vi.mocked(createSalesMaterial).mockResolvedValueOnce();
  submit('scene');
  await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith('已保存场景「待保存」；本机旧草稿未清除，请勿重复入库'));
  expect(onClose).toHaveBeenCalledOnce();
  expect(createSalesMaterial).toHaveBeenCalledOnce();
});

it.each(['persona', 'scene'] as const)('updates the original %s asset when an old draft survives a confirmed background submission', async (kind) => {
  draft.savedAssetId = 'already-saved';
  vi.mocked(updateSalesMaterial).mockResolvedValueOnce();
  submit(kind);
  await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(updateSalesMaterial).toHaveBeenCalledWith(kind, 'already-saved', expect.any(Object), expect.any(AbortSignal));
  expect(createSalesMaterial).not.toHaveBeenCalled();
});

it.each(['persona', 'scene'] as const)('requires reconciling an uncertain %s background receipt before manually creating another asset', (kind) => {
  draft.unconfirmedBackground = true;
  expect(pending(kind)).toBe(true);
  submit(kind);
  expect(createSalesMaterial).not.toHaveBeenCalled();
});
