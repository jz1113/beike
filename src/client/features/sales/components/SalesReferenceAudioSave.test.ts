import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SalesBgmCandidate } from '@shared/domain/sales';
import { importSalesBgm } from '../api/salesBgm';
import { SalesReferenceAudioSave } from './SalesReferenceAudioSave';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], refresh: vi.fn() }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: vi.fn(),
  useId: () => 'reference-audio-test',
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
vi.mock('../api/salesBgm', () => ({ importSalesBgm: vi.fn() }));
vi.mock('../hooks/useSalesMaterialCatalog', () => ({ useSalesMaterialCatalog: () => ({ refresh: hooks.refresh }) }));
vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));

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
const result: SalesBgmCandidate = { id: 'bgm_custom_audio', title: '街拍 · 原音轨', durationSec: 24,
  description: '', moodTags: [], bpm: 100, license: '参考视频原音轨', suitableCategories: [], audioUrl: '/storage/audio.m4a' };
function render(disabled = false, durationSec: number | undefined = 24) {
  hooks.index = 0;
  return SalesReferenceAudioSave({ videoUrl: '/storage/source.mp4', title: '街拍.mp4', durationSec, disabled });
}
function click(node: Node) { (node.props.onClick as () => void)(); }
function open() { click(find(render(), (node) => node.props['aria-controls'] === 'reference-audio-test')); }
function change(predicate: (node: Node) => boolean, value: string) {
  (find(render(), predicate).props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}
function saveNode(disabled = false) { return find(render(disabled), (node) => node.type === 'button' && String(node.props.className).includes('sales-collect-primary')); }
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; vi.clearAllMocks();
  vi.mocked(importSalesBgm).mockResolvedValue(result);
});

it('saves a complete original soundtrack only when requested and refreshes the asset catalog', async () => {
  open();
  expect(importSalesBgm).not.toHaveBeenCalled();
  expect(find(render(), (node) => node.type === 'p' && String(node.props.children).includes('人声和环境声')).props.children).toContain('原音轨');
  click(saveNode());
  await vi.waitFor(() => expect(hooks.refresh).toHaveBeenCalledOnce());
  expect(importSalesBgm).toHaveBeenCalledExactlyOnceWith({ videoUrl: '/storage/source.mp4', title: '街拍 · 原音轨' }, expect.any(AbortSignal));
  expect(find(render(), (node) => node.props.role === 'status').props.children).toContain('已保存到背景音乐 · ');
  expect(find(render(), (node) => node.type === 'audio').props.src).toBe('/storage/audio.m4a');
});

it('preserves the selected excerpt on failure and prevents concurrent duplicate imports', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(importSalesBgm).mockReturnValueOnce(new Promise((_, rejectPromise) => { reject = rejectPromise; }));
  open();
  change((node) => node.type === 'select', '10');
  change((node) => node.type === 'input' && node.props.type === 'number', '5.5');
  change((node) => node.type === 'input' && node.props.maxLength === 120, '转场配乐');
  const save = saveNode();
  click(save); click(save);
  expect(importSalesBgm).toHaveBeenCalledTimes(1);
  reject(new Error('保存失败，请重试'));
  await vi.waitFor(() => expect(find(render(), (node) => node.props.role === 'alert').props.children).toBe('保存失败，请重试'));
  expect(find(render(), (node) => node.type === 'input' && node.props.type === 'number').props.value).toBe('5.5');
  click(saveNode());
  await vi.waitFor(() => expect(hooks.refresh).toHaveBeenCalledOnce());
  expect(importSalesBgm).toHaveBeenLastCalledWith({ videoUrl: '/storage/source.mp4', title: '转场配乐', startSec: 5.5, durationSec: 10 }, expect.any(AbortSignal));
});

it('rejects invalid or out-of-range clip starts before importing', () => {
  open();
  change((node) => node.type === 'select', '15');
  for (const value of ['', '-1', '24', 'Infinity']) {
    change((node) => node.type === 'input' && node.props.type === 'number', value);
    expect(saveNode().props.disabled).toBe(true);
    click(saveNode());
  }
  expect(importSalesBgm).not.toHaveBeenCalled();
  change((node) => node.type === 'select', 'all');
  expect(saveNode().props.disabled).toBe(false);
});

it('enforces the request limit of 600 seconds even for a longer reference video', () => {
  open();
  change((node) => node.type === 'select', '10');
  change((node) => node.type === 'input' && node.props.type === 'number', '600.1');
  const root = render(false, 800);
  expect(find(root, (node) => node.type === 'input' && node.props.type === 'number').props.max).toBe(600);
  expect(find(root, (node) => node.props.role === 'alert').props.children).toContain('0–600');
  click(find(root, (node) => node.type === 'button' && String(node.props.className).includes('sales-collect-primary')));
  expect(importSalesBgm).not.toHaveBeenCalled();
  change((node) => node.type === 'input' && node.props.type === 'number', '600');
  expect(find(render(false, 800), (node) => node.type === 'button' && String(node.props.className).includes('sales-collect-primary')).props.disabled).toBe(false);
});

it('requires at least one second remaining and explains very short source videos', () => {
  open();
  change((node) => node.type === 'select', '10');
  change((node) => node.type === 'input' && node.props.type === 'number', '23.5');
  expect(find(render(), (node) => node.props.role === 'alert').props.children).toContain('至少需要保留 1 秒');
  click(saveNode());
  expect(importSalesBgm).not.toHaveBeenCalled();
  change((node) => node.type === 'input' && node.props.type === 'number', '23');
  expect(saveNode().props.disabled).toBe(false);
  change((node) => node.type === 'select', 'all');
  expect(find(render(false, 0.5), (node) => node.props.role === 'alert').props.children).toBe('视频不足 1 秒，无法保存音轨。');
});

it('previews the selected excerpt from its start and stops at its end', () => {
  open();
  change((node) => node.type === 'select', '10');
  change((node) => node.type === 'input' && node.props.type === 'number', '4');
  const player = find(render(), (node) => node.type === 'audio');
  const target = { currentTime: 0, pause: vi.fn() };
  (player.props.onPlay as (event: { currentTarget: typeof target }) => void)({ currentTarget: target });
  expect(target.currentTime).toBe(4);
  target.currentTime = 14;
  (player.props.onTimeUpdate as (event: { currentTarget: typeof target }) => void)({ currentTarget: target });
  expect(target.pause).toHaveBeenCalledOnce();
});

it('does not import while the parent operation is disabled', () => {
  open();
  expect(saveNode(true).props.disabled).toBe(true);
  click(saveNode(true));
  expect(importSalesBgm).not.toHaveBeenCalled();
});
