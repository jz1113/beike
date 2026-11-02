import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SalesMaterialCard } from '../model/salesMaterialCatalog';
import { SalesActionCard } from './SalesActionCard';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (value: T) => { hooks.slots[index] = value; }];
  },
}));
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
const review = vi.fn();
const card: SalesMaterialCard = { id: 'a', key: 'action:a', kind: 'action', title: '转身', description: '', tags: [], image: '/cover.jpg', video: '/video.mp4', audio: '', badge: '深度视频' };
function render(value = card) {
  hooks.index = 0;
  return SalesActionCard({ card: value, onReview: review, onDelete: vi.fn() });
}
function aspect(root: Node) { return (root.props.style as Record<string, number>)['--sales-reference-aspect']; }
function loadVideo(root: Node, videoWidth: number, videoHeight: number) {
  const currentTarget = { videoWidth, videoHeight, currentTime: 0 };
  (find(root, (node) => node.type === 'video').props.onLoadedMetadata as (event: { currentTarget: typeof currentTarget }) => void)({ currentTarget });
  return currentTarget;
}
beforeEach(() => { hooks.index = 0; hooks.slots = []; vi.clearAllMocks(); });

it('falls back from an unavailable video to its cover, then an explanation while preserving details access', () => {
  (find(render(), (node) => node.type === 'video').props.onError as () => void)();
  expect(find(render(), (node) => node.type === 'img').props.src).toBe(card.image);
  (find(render(), (node) => node.type === 'img').props.onError as () => void)();
  expect(find(render(), (node) => node.props.children === '视频预览暂不可用')).toBeTruthy();
  (find(render(), (node) => node.props['aria-label'] === '查看素材 转身').props.onClick as () => void)();
  expect(review).toHaveBeenCalledOnce();
});

it('retries previews when the media URL changes', () => {
  (find(render(), (node) => node.type === 'video').props.onError as () => void)();
  expect(find(render({ ...card, video: '/replacement.mp4' }), (node) => node.type === 'video').props.src).toBe('/replacement.mp4');
});

it('explains broken images instead of leaving a broken image element', () => {
  const image = { ...card, video: '' };
  (find(render(image), (node) => node.type === 'img').props.onError as () => void)();
  expect(find(render(image), (node) => node.props.children === '图片预览暂不可用')).toBeTruthy();
  expect(() => find(render(image), (node) => node.type === 'img')).toThrow('Control not found');
});

it('fits the preview to the video dimensions once metadata is available', () => {
  expect(aspect(render())).toBe(9 / 16);
  const video = loadVideo(render(), 1920, 1080);
  expect(aspect(render())).toBe(16 / 9);
  expect(video.currentTime).toBe(0.001);
});

it('resets the preview ratio when a different media URL replaces the video', () => {
  loadVideo(render(), 1200, 1200);
  expect(aspect(render())).toBe(1);
  const replacement = { ...card, video: '/replacement.mp4' };
  expect(aspect(render(replacement))).toBe(9 / 16);
  loadVideo(render(replacement), 1600, 1200);
  expect(aspect(render(replacement))).toBe(4 / 3);
});

it('uses the fallback image dimensions after the video preview fails', () => {
  loadVideo(render(), 1920, 1080);
  (find(render(), (node) => node.type === 'video').props.onError as () => void)();
  expect(aspect(render())).toBe(9 / 16);
  const currentTarget = { naturalWidth: 800, naturalHeight: 1000 };
  (find(render(), (node) => node.type === 'img').props.onLoad as (event: { currentTarget: typeof currentTarget }) => void)({ currentTarget });
  expect(aspect(render())).toBe(4 / 5);
});
