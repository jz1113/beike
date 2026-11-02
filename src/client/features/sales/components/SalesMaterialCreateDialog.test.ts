import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractVideoMetadataFromFile } from '@client/shared/media/mediaHelper';
import { createSalesMaterial, createSalesSound } from '../api/salesMaterials';
import { uploadSalesCustomAsset } from '../api/salesProduction';
import { SalesMaterialCreateDialog } from './SalesMaterialCreateDialog';
import { SalesMaterialUploadField } from './SalesMaterialUploadField';
import { SalesLibrarySelect } from './SalesLibrarySelect';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: vi.fn(),
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: T) => { hooks.slots[index] = value; }];
  },
}));
vi.mock('../api/salesMaterials', () => ({ createSalesMaterial: vi.fn(), createSalesSound: vi.fn() }));
vi.mock('../api/salesProduction', () => ({ uploadSalesCustomAsset: vi.fn() }));
vi.mock('@client/shared/media/mediaHelper', () => ({ extractVideoMetadataFromFile: vi.fn() }));
vi.mock('@client/shared/api/generation/seedancePrecheck', () => ({ runSeedancePrecheck: vi.fn() }));

type Node = ReactElement<Record<string, unknown>>;
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
function render(type: 'action' | 'sound', defaultSoundType: 'voice' | 'bgm' = 'bgm') {
  hooks.index = 0;
  return SalesMaterialCreateDialog({ type, defaultName: '测试资产', defaultSoundType, onClose: vi.fn(), onCreated: vi.fn() });
}
function select(root: Node, file: File | null) {
  const field = find(root, (node) => node.type === SalesMaterialUploadField);
  (field.props.onChange as (file: File | null) => void)(file);
}
function submit(root: Node) {
  (find(root, (node) => node.type === 'form').props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
}
function saveDisabled(root: Node) {
  return find(root, (node) => node.props.type === 'submit').props.disabled;
}

beforeEach(() => {
  hooks.index = 0; hooks.slots = [];
  vi.resetAllMocks();
  vi.mocked(uploadSalesCustomAsset).mockResolvedValue('/storage/test');
});

describe('asset upload submission', () => {
  it('requires the selected BGM file and returns to the disabled state when it is removed', () => {
    let root = render('sound');
    expect(saveDisabled(root)).toBe(true);
    submit(root);
    expect(createSalesSound).not.toHaveBeenCalled();
    select(root, new File(['audio'], 'bgm.wav', { type: 'audio/wav' }));
    root = render('sound');
    expect(saveDisabled(root)).toBe(false);
    select(root, null);
    root = render('sound');
    expect(saveDisabled(root)).toBe(true);
    submit(root);
    expect(uploadSalesCustomAsset).not.toHaveBeenCalled();
  });

  it('keeps the human voice sample optional', async () => {
    const root = render('sound', 'voice');
    expect(saveDisabled(root)).toBe(false);
    submit(root);
    await vi.waitFor(() => expect(createSalesSound).toHaveBeenCalledWith(expect.objectContaining({ soundType: 'voice', name: '测试资产', audioUrl: '' }), expect.any(AbortSignal)));
    expect(uploadSalesCustomAsset).not.toHaveBeenCalled();
  });

  it('does not save an invalid video while duration validation is pending or after it fails', async () => {
    let resolveMetadata!: (value: Awaited<ReturnType<typeof extractVideoMetadataFromFile>>) => void;
    vi.mocked(extractVideoMetadataFromFile).mockImplementation(() => new Promise((resolve) => { resolveMetadata = resolve; }));
    select(render('action'), new File(['video'], 'action.mp4', { type: 'video/mp4' }));
    let root = render('action');
    expect(saveDisabled(root)).toBe(true);
    submit(root);
    resolveMetadata({ thumbnailUrl: '', duration: 60, width: 720, height: 1280 });
    await vi.waitFor(() => expect(find(render('action'), (node) => node.props.role === 'alert').props.children).toContain('2 ~ 30'));
    root = render('action');
    expect(saveDisabled(root)).toBe(true);
    submit(root);
    expect(createSalesMaterial).not.toHaveBeenCalled();
    expect(uploadSalesCustomAsset).not.toHaveBeenCalled();
  });

  it('ignores an old video probe after switching to an image upload', async () => {
    let resolveMetadata!: (value: Awaited<ReturnType<typeof extractVideoMetadataFromFile>>) => void;
    vi.mocked(extractVideoMetadataFromFile).mockImplementation(() => new Promise((resolve) => { resolveMetadata = resolve; }));
    select(render('action'), new File(['video'], 'action.mp4', { type: 'video/mp4' }));
    const root = render('action');
    const media = find(root, (node) => node.type === SalesLibrarySelect && node.props.label === '动作媒体类型');
    expect(media.props.value).toBe('depth-video');
    (media.props.onChange as (value: string) => void)('depth-image');
    const image = new File(['image'], 'action.png', { type: 'image/png' });
    select(render('action'), image);
    resolveMetadata({ thumbnailUrl: '', duration: 5, width: 720, height: 1280 });
    await Promise.resolve();
    expect(find(render('action'), (node) => node.type === SalesMaterialUploadField).props.file).toBe(image);
    submit(render('action'));
    await vi.waitFor(() => expect(createSalesMaterial).toHaveBeenCalledWith('action', expect.objectContaining({ mediaType: 'depth-image', mediaUrl: '/storage/test' }), expect.any(AbortSignal)));
    expect(uploadSalesCustomAsset).toHaveBeenCalledWith(image, 'assets', expect.any(AbortSignal));
  });
});
