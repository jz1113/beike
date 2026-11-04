import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSalesSound, updateSalesSound } from '../api/salesMaterials';
import { uploadSalesCustomAsset } from '../api/salesProduction';
import { salesMaterialCards } from '../model/salesMaterialCatalog';
import { SalesMaterialCreateDialog } from './SalesMaterialCreateDialog';
import { SalesMaterialDetailDialog } from './SalesMaterialDetailDialog';
import { SalesMaterialUploadField } from './SalesMaterialUploadField';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
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
vi.mock('../api/salesMaterials', () => ({ createSalesMaterial: vi.fn(), createSalesSound: vi.fn(), updateSalesMaterial: vi.fn(), updateSalesSound: vi.fn(), deleteSalesMaterial: vi.fn(), deleteSalesSound: vi.fn() }));
vi.mock('../api/salesProduction', () => ({ uploadSalesCustomAsset: vi.fn() }));

type Node = ReactElement<Record<string, unknown>>;
const callbacks = { onClose: vi.fn(), onCreated: vi.fn(), onChanged: vi.fn() };
const voiceCard = () => salesMaterialCards({ personas: [], scenes: [], actions: [], bgms: [], voices: [{
  id: 'voice', name: '已保存人声', voiceId: 'provider-old', ttsVoice: 'provider-old', gender: 'female', voiceGroup: 'female', tags: [], sampleAudioUrl: '/sample.mp3', promptText: '', source: 'voice_library',
}] })[0];
function render(kind: 'create' | 'detail' = 'create') {
  hooks.index = 0;
  return kind === 'create' ? SalesMaterialCreateDialog({ type: 'sound', defaultName: '新增人声', ...callbacks })
    : SalesMaterialDetailDialog({ card: voiceCard(), images: [], ...callbacks });
}
function find(root: Node, predicate: (node: Node) => boolean): Node {
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    if (predicate(node)) return node;
    Children.forEach(node.props.children as ReactElement, (child) => { if (isValidElement<Record<string, unknown>>(child)) queue.push(child); });
  }
  throw new Error('Control not found');
}
const input = (root: Node) => find(root, (node) => node.type === 'input' && node.props['aria-label'] === '合成音色编号');
const setId = (root: Node, value: string) => (input(root).props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
const click = (root: Node, label: string) => (find(root, (node) => node.type === 'button' && Children.toArray(node.props.children as ReactElement).includes(label)).props.onClick as () => void)();
const submit = (root: Node) => (find(root, (node) => node.type === 'form').props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; vi.resetAllMocks();
  vi.mocked(createSalesSound).mockResolvedValue();
  vi.mocked(updateSalesSound).mockResolvedValue();
  vi.mocked(uploadSalesCustomAsset).mockResolvedValue('/uploaded-sample.mp3');
});

describe('voice synthesis identifier configuration', () => {
  it('lets a new voice save a provider identifier without requiring an uploaded sample', async () => {
    setId(render(), '  provider-new  ');
    submit(render());
    await vi.waitFor(() => expect(createSalesSound).toHaveBeenCalledOnce());
    expect(createSalesSound).toHaveBeenCalledWith(expect.objectContaining({ soundType: 'voice', voiceId: 'provider-new', audioUrl: '' }), expect.any(AbortSignal));
  });

  it('allows a sample-only voice to keep its synthesis identifier empty', async () => {
    const upload = find(render(), (node) => node.type === SalesMaterialUploadField);
    expect(upload.props.hint).toContain('超过 15 秒会自动保留前 15 秒');
    expect(upload.props.hint).toContain('原文件保留');
    (upload.props.onChange as (file: File) => void)(new File(['audio'], 'sample.mp3', { type: 'audio/mpeg' }));
    submit(render());
    await vi.waitFor(() => expect(createSalesSound).toHaveBeenCalledOnce());
    expect(createSalesSound).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: '/uploaded-sample.mp3', voiceId: '' }), expect.any(AbortSignal));
  });

  it('keeps an empty ID and no sample compatible with the server default on create', async () => {
    submit(render());
    await vi.waitFor(() => expect(createSalesSound).toHaveBeenCalledOnce());
    expect(createSalesSound).toHaveBeenCalledWith(expect.objectContaining({ voiceId: '', audioUrl: '' }), expect.any(AbortSignal));
  });

  it('retains the stored identifier through catalog mapping, edit display and PATCH', async () => {
    expect(voiceCard().voiceId).toBe('provider-old');
    click(render('detail'), '编辑');
    expect(input(render('detail')).props.value).toBe('provider-old');
    setId(render('detail'), '  provider-updated  ');
    submit(render('detail'));
    await vi.waitFor(() => expect(updateSalesSound).toHaveBeenCalledOnce());
    expect(updateSalesSound).toHaveBeenCalledWith('voice', expect.objectContaining({ voiceId: 'provider-updated' }));
  });

  it('supports explicitly clearing a stored synthesis ID while retaining its sample', async () => {
    click(render('detail'), '编辑');
    setId(render('detail'), '');
    submit(render('detail'));
    await vi.waitFor(() => expect(updateSalesSound).toHaveBeenCalledOnce());
    expect(updateSalesSound).toHaveBeenCalledWith('voice', expect.objectContaining({ voiceId: '' }));
    expect(voiceCard().audio).toBe('/sample.mp3');
  });

  it('restores the stored identifier when canceling an edit', () => {
    click(render('detail'), '编辑');
    setId(render('detail'), 'unsaved-provider');
    click(render('detail'), '取消编辑');
    click(render('detail'), '编辑');
    expect(input(render('detail')).props.value).toBe('provider-old');
    expect(updateSalesSound).not.toHaveBeenCalled();
  });

  it('keeps the existing BGM upload guidance separate from voice sample limits', () => {
    const root = SalesMaterialCreateDialog({ type: 'sound', defaultSoundType: 'bgm', ...callbacks });
    const upload = find(root, (node) => node.type === SalesMaterialUploadField);
    expect(upload.props.hint).toBe('MP3、WAV、M4A 等音频格式');
    expect(upload.props.label).toBe('上传 BGM 音频文件');
  });
});
