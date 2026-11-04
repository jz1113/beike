import { Children, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import { fetchSalesStudioAssets } from '../api/salesProduction';
import { patchSalesScript, uploadScriptVideo, type StoredSalesScript } from '../api/salesScripts';
import type { SalesScriptDraft } from '../hooks/useSalesScripts';
import { SalesScriptLinkedVideo } from './SalesScriptLinkedVideo';

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
vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));
vi.mock('../api/salesProduction', () => ({ fetchSalesStudioAssets: vi.fn() }));
vi.mock('../api/salesScripts', () => ({ patchSalesScript: vi.fn(), uploadScriptVideo: vi.fn() }));

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
function button(root: Node, label: string) {
  return find(root, (node) => node.type === 'button' && Children.toArray(node.props.children as ReactElement).includes(label));
}
const script = normalizeScriptTemplate({ title: '手势舞', durationSec: 3,
  shots: [{ start: 0, end: 3, beats: [{ start: 0, end: 3, actionTemplate: '展示{{商品}}' }] }] })!;
const draft: SalesScriptDraft = { id: 'script-1', script, status: 'verified', model: '', promptVersion: '', videoUrl: '/source.mp4' };
const saved: StoredSalesScript = { ...draft, id: 'script-1', title: script.title, videoUrl: '/source.mp4', videoHash: 'source-hash', version: 1, useCount: 0, updatedAt: '' };
const onConvert = vi.fn();
const onSaved = vi.fn();
function render(patch: Partial<SalesScriptDraft> = {}) {
  hooks.index = 0;
  return SalesScriptLinkedVideo({ draft: { ...draft, ...patch }, disabled: false, onConvert, onSaved });
}
function click(node: Node) { (node.props.onClick as () => void)(); }
beforeEach(() => { hooks.index = 0; hooks.slots = []; vi.resetAllMocks(); });

it('shows only the depth video and omits source preview and soundtrack actions', () => {
  const html = renderToStaticMarkup(render({ depthVideoUrl: '/depth.mp4' }));
  expect(html.match(/<video\b/g)).toHaveLength(1);
  expect(html).toContain('src="/depth.mp4"');
  expect(html).not.toContain('/source.mp4');
  expect(html).not.toContain('脚本原视频');
  expect(html).not.toContain('音轨');
  expect(html).not.toContain('type="file"');
  expect(uploadScriptVideo).not.toHaveBeenCalled();
  expect(patchSalesScript).not.toHaveBeenCalled();
});

it('keeps an existing source available for depth conversion without exposing it as a preview', () => {
  const root = render();
  const html = renderToStaticMarkup(root);
  expect(html).toContain('尚未关联深度动作视频');
  expect(html).not.toContain('<video');
  expect(html).not.toContain('上传视频生成深度');
  click(button(root, '补生成深度视频'));
  expect(onConvert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'script-1', videoUrl: '/source.mp4' }));
  expect(patchSalesScript).not.toHaveBeenCalled();
});

it('starts an explicit fresh conversion of an existing depth without deleting its saved result or source', () => {
  const root = render({ depthVideoUrl: '/old-depth.mp4', depthTaskId: 'old-task', depthOperationId: 'old-operation' });
  const html = renderToStaticMarkup(root);
  expect(html).toContain('src="/old-depth.mp4"');
  expect(html).toContain('新结果完成前保留现有深度视频');
  click(button(root, '从原视频重新生成深度'));
  expect(onConvert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    id: 'script-1', videoUrl: '/source.mp4', depthVideoUrl: '', depthTaskId: '', depthOperationId: '',
  }));
  expect(patchSalesScript).not.toHaveBeenCalled();
});

it('queries an existing depth receipt even when its source is unavailable', () => {
  const root = render({ videoUrl: '', depthOperationId: 'operation-1', depthTaskId: 'task-1' });
  expect(renderToStaticMarkup(root)).not.toContain('上传视频生成深度');
  click(button(root, '查询关联深度任务'));
  expect(onConvert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ depthOperationId: 'operation-1', depthTaskId: 'task-1' }));
});

it('passes the chosen file directly to depth processing without saving a source attachment', async () => {
  const file = new File(['video'], 'source.mp4', { type: 'video/mp4' });
  vi.mocked(uploadScriptVideo).mockResolvedValue({ success: true, videoUrl: '/source.mp4', videoHash: 'source-hash', durationSec: 3,
    aspectRatio: '9:16', hasAudio: true, sizeBytes: 5 });
  vi.mocked(patchSalesScript).mockResolvedValue(saved);
  const root = render({ videoUrl: '' });
  expect(renderToStaticMarkup(root)).toContain('上传视频生成深度');
  const input = find(root, (node) => node.type === 'input' && node.props.type === 'file');
  (input.props.onChange as (event: { target: { files: File[]; value: string } }) => void)({ target: { files: [file], value: 'source.mp4' } });
  expect(onConvert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id:'script-1',videoUrl:''}),file);
  expect(uploadScriptVideo).not.toHaveBeenCalled();
  expect(patchSalesScript).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

it('does not request a new source when a depth video is already available', () => {
  const html = renderToStaticMarkup(render({ videoUrl: '', depthVideoUrl: '/depth.mp4' }));
  expect(html).toContain('src="/depth.mp4"');
  expect(html).not.toContain('尚未关联');
  expect(html).not.toContain('上传视频生成深度');
  expect(html).not.toContain('补生成深度视频');
});

it('links an existing depth action without replacing the saved source', async () => {
  vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ personas: [], scenes: [], voices: [], bgms: [], actions: [
    { id: 'action-1', title: '深度动作', mediaType: 'depth-video', mediaUrl: '/existing-depth.mp4', action: '', shotType: '', camera: '', tags: '', coverUrl: '' },
  ] });
  vi.mocked(patchSalesScript).mockResolvedValue({ ...saved, depthVideoUrl: '/existing-depth.mp4' });
  click(button(render(), '关联已有深度动作'));
  await vi.waitFor(() => expect(find(render(), (node) => node.type === 'select')).toBeDefined());
  const select = find(render(), (node) => node.type === 'select');
  (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'action-1' } });
  click(button(render(), '保存关联'));
  await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(patchSalesScript).toHaveBeenCalledExactlyOnceWith('script-1', { depthVideoUrl: '/existing-depth.mp4', depthTaskId: '', depthOperationId: '' });
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ videoUrl: '/source.mp4', depthVideoUrl: '/existing-depth.mp4' }));
});
