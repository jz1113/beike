import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { SalesScriptCard } from './SalesScriptCard';
import { SalesScriptQuickClassify } from './SalesScriptQuickClassify';
import type { StoredSalesScript } from '../api/salesScripts';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
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
vi.mock('@client/shared/utils/confirmAction', () => ({ confirmAction: vi.fn() }));
vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));
type Node = ReactElement<Record<string, unknown>>;
function find(root: Node, predicate: (node: Node) => boolean): Node {
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    if (predicate(node)) return node;
    Children.forEach(node.props.children as ReactElement, (child) => { if (isValidElement<Record<string, unknown>>(child)) queue.push(child); });
  }
  throw new Error('Control not found');
}
const script = normalizeScriptTemplate({ title: '参考', durationSec: 3, shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, actionTemplate: '展示' }] }] })!;
const item: StoredSalesScript = { id: 's', title: '参考', videoUrl: '', videoHash: '', status: 'verified', script, model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '' };
const remove = vi.fn();
function render(reference = item) {
  hooks.index = 0;
  return SalesScriptCard({ item: reference, taxonomyItems: [], taxonomyLoading: false, onManageTaxonomy: vi.fn(), onQuickClassify: vi.fn(), onReview: vi.fn(), onArchive: vi.fn(), onDelete: remove });
}
function deleteButton() { return find(render(), (node) => node.props['aria-label'] === '删除脚本 参考'); }
const clickDelete = () => (deleteButton().props.onClick as () => void)();
beforeEach(() => { hooks.index = 0; hooks.slots = []; vi.resetAllMocks(); });

function referenceWithMedia(): StoredSalesScript {
  const reference = { ...item, videoUrl: '/source.mp4', depthVideoUrl: '/depth.mp4', script: structuredClone(script) };
  reference.script.shots[0].beats[0].previewFrameUrl = '/source-frame.jpg';
  return reference;
}

it('uses the depth video first frame even when the source video and storyboard frame are available', () => {
  const root = render(referenceWithMedia());
  expect(find(root, (node) => node.type === 'video').props.src).toBe('/depth.mp4');
  expect(() => find(root, (node) => node.type === 'img')).toThrow('Control not found');
});

it('shows a placeholder without using source media when depth video is missing', () => {
  const root = render({ ...referenceWithMedia(), depthVideoUrl: '' });
  expect(() => find(root, (node) => node.type === 'video' || node.type === 'img')).toThrow('Control not found');
  expect(find(root, (node) => node.props.className === 'sales-script-card-placeholder').props.children).toContain('暂无深度视频封面');
});

it('keeps source media hidden when the depth preview fails and accepts a replacement depth video', () => {
  const reference = referenceWithMedia();
  (find(render(reference), (node) => node.type === 'video').props.onError as () => void)();
  const root = render(reference);
  expect(() => find(root, (node) => node.type === 'video' || node.type === 'img')).toThrow('Control not found');
  expect(find(render({ ...reference, depthVideoUrl: '/replacement-depth.mp4' }), (node) => node.type === 'video').props.src).toBe('/replacement-depth.mp4');
});

it('does not delete a script when confirmation is canceled', async () => {
  vi.mocked(confirmAction).mockResolvedValue(false);
  clickDelete(); await Promise.resolve();
  expect(remove).not.toHaveBeenCalled();
});
it('prevents duplicate deletion and retains the card with a retry after failure', async () => {
  vi.mocked(confirmAction).mockResolvedValue(true);
  let resolve!: (value: boolean) => void;
  remove.mockReturnValueOnce(new Promise<boolean>((done) => { resolve = done; })).mockResolvedValueOnce(true);
  clickDelete(); clickDelete();
  await vi.waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith('s'));
  expect(confirmAction).toHaveBeenCalledOnce();
  expect(deleteButton().props.disabled).toBe(true);
  resolve(false);
  await vi.waitFor(() => expect(find(render(), (node) => node.props.role === 'alert').props.children).toContain('删除失败'));
  expect(deleteButton().props.disabled).toBe(false);
  clickDelete();
  await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
});
it('opens classification outside the overflow menu and unmounts it on cancel', () => {
  const button = find(render(), (node) => node.props['aria-label'] === '调整 参考 分类与风格');
  (button.props.onClick as () => void)();
  const root = render();
  const dialog = find(root, (node) => node.type === SalesScriptQuickClassify);
  expect(Children.toArray(root.props.children).some((child) => isValidElement(child) && child.type === SalesScriptQuickClassify)).toBe(true);
  (dialog.props.onClose as () => void)();
  expect(() => find(render(), (node) => node.type === SalesScriptQuickClassify)).toThrow('Control not found');
});
