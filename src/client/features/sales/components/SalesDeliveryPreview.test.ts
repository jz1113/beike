import { Children, isValidElement, type ComponentProps, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { describeMediaPlaybackError } from '@client/shared/media/mediaPlayback';
import { SalesDeliveryPreview } from './SalesDeliveryPreview';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], pending: [] as (() => void)[], cleanups: new Map<number, () => void>() }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  ...(await import('../hooks/salesProductionTestRuntime')).salesProductionTestHooks(hooks),
}));
vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));
vi.mock('@client/shared/media/mediaPlayback', () => ({ describeMediaPlaybackError: vi.fn() }));

type Node = ReactElement<Record<string, unknown>>;
const base: ComponentProps<typeof SalesDeliveryPreview> = {
  active: true, rawVideoUrl: '/raw.mp4', finalVideoUrl: '', generating: false, mixing: false, progressText: '', durationSec: 15, aspectRatio: '9:16',
};
const media = { load: vi.fn(), pause: vi.fn(), error: { code: 4 } };
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
function button(root: Node, label: string) {
  return find(root, (node) => node.type === 'button' && Children.toArray(node.props.children as ReactElement).includes(label));
}
function render(patch: Partial<ComponentProps<typeof SalesDeliveryPreview>> = {}) {
  hooks.index = 0;
  const root = SalesDeliveryPreview({ ...base, ...patch });
  if (base.rawVideoUrl || patch.finalVideoUrl) {
    (find(root, (node) => node.type === 'video').props.ref as { current: unknown }).current = media;
  }
  for (const effect of hooks.pending.splice(0)) effect();
  return root;
}
function event(root: Node, name: string) { (find(root, (node) => node.type === 'video').props[name] as () => void)(); }
function click(root: Node, label: string) { (button(root, label).props.onClick as () => void)(); }

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.pending = []; hooks.cleanups.clear();
  vi.resetAllMocks();
  vi.mocked(describeMediaPlaybackError).mockResolvedValue('媒体服务暂时不可用，请确认后台服务已启动后重试。');
});
afterEach(() => { for (const cleanup of hooks.cleanups.values()) cleanup(); });

it('waits for playable data before reporting that a saved raw video is ready', () => {
  let root = render();
  expect(renderToStaticMarkup(root)).toContain('正在加载视频');
  expect(renderToStaticMarkup(root)).not.toContain('原片就绪');
  event(root, 'onLoadedData');
  root = render();
  expect(renderToStaticMarkup(root)).toContain('原片就绪');
  expect(renderToStaticMarkup(root)).toContain('下载原视频');
  expect(renderToStaticMarkup(root)).not.toContain('正在加载视频');
});

it('explains backend failure and reloads the same video without requesting regeneration', async () => {
  event(render(), 'onError');
  await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain('后台服务已启动'));
  expect(describeMediaPlaybackError).toHaveBeenCalledWith('/raw.mp4', 4, expect.any(AbortSignal));
  const failed = renderToStaticMarkup(render());
  expect(failed).toContain('加载失败');
  expect(failed).not.toContain('原片就绪');
  expect(failed).toContain('href="/raw.mp4"');
  click(render(), '重新加载视频');
  expect(media.load).toHaveBeenCalledOnce();
  expect(renderToStaticMarkup(render())).toContain('正在加载视频');
  event(render(), 'onCanPlay');
  expect(renderToStaticMarkup(render())).toContain('原片就绪');
});

it('switches between final and raw files with separate readiness and download labels', () => {
  const props = { finalVideoUrl: '/final.mp4' };
  let root = render(props);
  expect(find(root, (node) => node.type === 'video').props.src).toBe('/final.mp4');
  event(root, 'onLoadedData');
  expect(renderToStaticMarkup(render(props))).toContain('成片就绪');
  expect(renderToStaticMarkup(render(props))).toContain('下载成片');
  click(render(props), '原视频');
  root = render(props);
  expect(find(root, (node) => node.type === 'video').props.src).toBe('/raw.mp4');
  expect(renderToStaticMarkup(root)).not.toContain('成片就绪');
  expect(renderToStaticMarkup(root)).toContain('下载原视频');
  event(root, 'onLoadedData');
  expect(renderToStaticMarkup(render(props))).toContain('原片就绪');
  click(render(props), '最终成片');
  expect(find(render(props), (node) => node.type === 'video').props.src).toBe('/final.mp4');
});

it('pauses and avoids preloading when the delivery page becomes inactive', () => {
  render();
  const root = render({ active: false });
  expect(media.pause).toHaveBeenCalledOnce();
  expect(find(root, (node) => node.type === 'video').props.preload).toBe('none');
  expect(renderToStaticMarkup(root)).not.toContain('正在加载视频');
});

it('cancels diagnostics on source changes so an old error cannot replace a new video state', async () => {
  let resolve!: (message: string) => void;
  vi.mocked(describeMediaPlaybackError).mockImplementation(() => new Promise<string>((done) => { resolve = done; }));
  event(render(), 'onError');
  const signal = vi.mocked(describeMediaPlaybackError).mock.calls[0][2];
  const props = { rawVideoUrl: '/new.mp4' };
  event(render(props), 'onLoadedData');
  expect(signal?.aborted).toBe(true);
  resolve('旧文件已经失效');
  await Promise.resolve();
  const html = renderToStaticMarkup(render(props));
  expect(html).toContain('原片就绪');
  expect(html).not.toContain('旧文件已经失效');
  expect(html).toContain('src="/new.mp4"');
});

it('cancels an outstanding media diagnostic when the preview unmounts', () => {
  vi.mocked(describeMediaPlaybackError).mockReturnValue(new Promise<string>(() => {}));
  event(render(), 'onError');
  const signal = vi.mocked(describeMediaPlaybackError).mock.calls[0][2];
  expect(signal?.aborted).toBe(false);
  for (const cleanup of hooks.cleanups.values()) cleanup();
  expect(signal?.aborted).toBe(true);
});
