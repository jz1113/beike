import { Children, isValidElement, type ComponentProps, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { createSalesMaterial, deleteSalesMaterial, updateSalesMaterial } from '../api/salesMaterials';
import { SalesPersonaDialog } from './SalesPersonaDialog';
import { SalesSceneDialog } from './SalesSceneDialog';
import { SalesAssetDraftStatus } from './SalesAssetDraftStatus';

const draft = vi.hoisted(() => ({ clear: vi.fn(), flush: vi.fn(), status: 'saved' as const, fields: { name: '待保存', group: 'female', voiceId: '', space: 'indoor', tags: '' }, setField: vi.fn(), upload: vi.fn(), savedAssetId: undefined as string | undefined, unconfirmedBackground: false, background: true, active: [] as string[], stage: '' as '' | 'uploading' | 'generating' }));
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
vi.mock('../hooks/useSalesAssetDraft', () => ({ useSalesAssetDraft: () => ({
  fields: draft.fields, setField: draft.setField, clear: draft.clear, status: draft.status, flush: draft.flush, error: '',
}) }));
const dimensions = (base?: string) => JSON.stringify({ ...JSON.parse(base || '{}'), assetCreation: { referenceImageUrl: '/reference.jpg', prompt: '自然光下的全新形象', imageUrl: '/main.jpg' } });
vi.mock('../hooks/useSalesPersonaViews', () => ({ useSalesPersonaViews: () => ({ views: { main: '/main.jpg' }, extraImages: [], active: draft.active, background: draft.background, stage: draft.stage, upload: draft.upload, savedAssetId: draft.savedAssetId, unconfirmedBackground: draft.unconfirmedBackground, withCreationDimensions: dimensions }) }));
vi.mock('../hooks/useSalesSceneViews', () => ({ useSalesSceneViews: () => ({ views: { main: '/main.jpg' }, extraImages: [], active: draft.active, background: draft.background, stage: draft.stage, savedAssetId: draft.savedAssetId, unconfirmedBackground: draft.unconfirmedBackground, withCreationDimensions: dimensions }) }));
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
beforeEach(() => { hooks.cleanup?.(); hooks.cleanup = undefined; hooks.slots = []; vi.clearAllMocks(); draft.clear.mockReturnValue(true); draft.flush.mockReturnValue(true); draft.fields.name = '待保存'; draft.fields.group = 'female'; draft.savedAssetId = undefined; draft.unconfirmedBackground = false; draft.background = true; draft.active = []; draft.stage = ''; });

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

it.each(['persona', 'scene'] as const)('preserves the %s drawing prompt and generated main image when saving the asset', async (kind) => {
  vi.mocked(createSalesMaterial).mockResolvedValueOnce();
  submit(kind);
  await vi.waitFor(() => expect(createSalesMaterial).toHaveBeenCalledOnce());
  const data = vi.mocked(createSalesMaterial).mock.calls[0][1];
  expect(JSON.parse(data.dimensions as string).assetCreation).toEqual({ referenceImageUrl: '/reference.jpg', prompt: '自然光下的全新形象', imageUrl: '/main.jpg' });
});

it.each(['persona', 'scene'] as const)('allows closing a confirmed %s background task while keeping edits locked', (kind) => {
  draft.active = ['face']; draft.stage = 'generating'; draft.savedAssetId = 'confirmed-asset';
  const root = Render(kind);
  const headerClose = find(root, (node) => node.type === 'button' && node.props['aria-label'] === `关闭${kind === 'persona' ? '人物' : '场景'}窗口`);
  const footerClose = find(root, (node) => node.type === 'button' && node.props.children === '暂存关闭');
  expect(headerClose.props.disabled).toBe(false);
  expect(footerClose.props.disabled).toBe(false);
  expect(find(root, (node) => node.type === 'input').props.disabled).toBe(true);
  expect(find(root, (node) => node.type === 'button' && node.props.type === 'submit').props.disabled).toBe(true);
  (headerClose.props.onClick as () => void)();
  (footerClose.props.onClick as () => void)();
  const preventDefault = vi.fn();
  (root.props.onCancel as (event: { preventDefault: () => void }) => void)({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(draft.flush).toHaveBeenCalledTimes(3);
  expect(onClose).toHaveBeenCalledTimes(3);
  expect(draft.clear).not.toHaveBeenCalled();
});

it.each(['persona', 'scene'] as const)('keeps a %s dialog open during upload or before background confirmation', (kind) => {
  draft.active = ['face'];
  for (const state of [
    { savedAssetId: undefined, unconfirmedBackground: false, stage: 'generating' as const, background: true },
    { savedAssetId: 'old-asset', unconfirmedBackground: true, stage: 'generating' as const, background: true },
    { savedAssetId: 'confirmed-asset', unconfirmedBackground: false, stage: 'uploading' as const, background: true },
    { savedAssetId: 'confirmed-asset', unconfirmedBackground: false, stage: 'generating' as const, background: false },
  ]) {
    Object.assign(draft, state);
    const root = Render(kind);
    const close = find(root, (node) => node.type === 'button' && node.props.children === '暂存关闭');
    expect(close.props.disabled).toBe(true);
    (close.props.onClick as () => void)();
    (root.props.onCancel as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
  }
  expect(onClose).not.toHaveBeenCalled();
  expect(draft.flush).not.toHaveBeenCalled();
});
