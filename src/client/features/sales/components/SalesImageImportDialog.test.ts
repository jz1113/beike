import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { loadSystemConfiguredModels } from '@client/shared/models/configuredModels';
import { importSalesImageAsset } from '../api/salesImageImport';
import { fetchSalesStudioAssets } from '../api/salesProduction';
import { uploadSalesViewImage } from '../api/salesAssetViews';
import { SalesImageImportDialog } from './SalesImageImportDialog';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(), useEffect: () => undefined,
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.slots[index], (next: T | ((previous: T) => T)) => { hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next; }];
  },
}));
vi.mock('@client/shared/models/configuredModels', () => ({ loadSystemConfiguredModels: vi.fn() }));
vi.mock('../model/salesAssetModels', () => ({ supportsSalesAssetReferences: (id: string) => id !== 'no-references' }));
vi.mock('../api/salesImageImport', () => ({ importSalesImageAsset: vi.fn() }));
vi.mock('../api/salesProduction', () => ({ fetchSalesStudioAssets: vi.fn() }));
vi.mock('../api/salesAssetViews', () => ({ uploadSalesViewImage: vi.fn() }));

type Node = ReactElement<Record<string, unknown>>;
const onImported = vi.fn();
function Render() {
  hooks.index = 0;
  return SalesImageImportDialog({ kind: 'scene', existingNames: [], personaGroup: 'female', sceneSpace: 'outdoor', onClose: vi.fn(), onImported });
}
function find(predicate: (node: Node) => boolean): Node | undefined {
  const queue = [Render() as Node];
  while (queue.length) {
    const node = queue.shift()!;
    if (predicate(node)) return node;
    Children.forEach(node.props.children as ReactNode, (child) => { if (isValidElement<Record<string, unknown>>(child)) queue.push(child); });
  }
}
function checkbox() { return find((node) => node.type === 'input' && node.props.type === 'checkbox')!; }
function addImage() {
  (find((node) => node.type === 'input' && node.props.type === 'file')!.props.onChange as (event: unknown) => void)({ target: { files: [new File(['image'], 'a.jpg', { type: 'image/jpeg' })], value: '' } });
}
function submit() { (find((node) => node.type === 'form')!.props.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() }); }

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; vi.clearAllMocks();
  vi.mocked(loadSystemConfiguredModels).mockReturnValue({ selectedImageGenModel: 'no-references', availableImageModels: [{ id: 'no-references' }, { id: 'ref-model' }, { id: 'other-ref-model' }] } as ReturnType<typeof loadSystemConfiguredModels>);
  vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ personas: [], scenes: [], actions: [], voices: [], bgms: [] });
  vi.mocked(uploadSalesViewImage).mockResolvedValue('/main.jpg');
  vi.mocked(importSalesImageAsset).mockResolvedValue(undefined);
});

it('defaults to importing only the original image without a generation model', async () => {
  expect(checkbox().props.checked).toBe(false);
  expect(find((node) => node.type === ConfiguredModelPicker)).toBeUndefined();
  addImage(); submit();
  await vi.waitFor(() => expect(onImported).toHaveBeenCalledWith(1));
  expect(importSalesImageAsset).toHaveBeenCalledWith('scene', expect.objectContaining({ title: '场景1' }), undefined, expect.any(AbortSignal));
});

it('filters unsupported models and uses the selected model for the whole background batch', async () => {
  (checkbox().props.onChange as (event: unknown) => void)({ target: { checked: true } });
  const picker = find((node) => node.type === ConfiguredModelPicker)!;
  expect(picker.props.options).toEqual([{ id: 'ref-model' }, { id: 'other-ref-model' }]);
  expect(picker.props.value).toBe('ref-model');
  (picker.props.onChange as (id: string) => void)('other-ref-model');
  addImage();
  expect(Children.toArray(find((node) => node.type === 'button' && node.props.type === 'submit')!.props.children as ReactNode)).toContain('导入并后台生成 1 项');
  submit(); await vi.waitFor(() => expect(onImported).toHaveBeenCalledWith(1));
  expect(importSalesImageAsset).toHaveBeenCalledWith('scene', expect.any(Object), { model: 'other-ref-model' }, expect.any(AbortSignal));
});

it('requires a supported model when background generation is enabled', () => {
  vi.mocked(loadSystemConfiguredModels).mockReturnValue({ selectedImageGenModel: '', availableImageModels: [] } as unknown as ReturnType<typeof loadSystemConfiguredModels>);
  (checkbox().props.onChange as (event: unknown) => void)({ target: { checked: true } });
  addImage();
  expect(find((node) => node.type === 'button' && node.props.type === 'submit')!.props.disabled).toBe(true);
  submit(); expect(importSalesImageAsset).not.toHaveBeenCalled(); expect(fetchSalesStudioAssets).not.toHaveBeenCalled();
});
