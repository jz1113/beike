import { Children, isValidElement, type ComponentProps, type ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { patchSalesScript } from '../api/salesScripts';
import { SalesActionLinkDialog } from './SalesActionLinkDialog';

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
vi.mock('../api/salesScripts', () => ({ patchSalesScript: vi.fn() }));
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
const props: ComponentProps<typeof SalesActionLinkDialog> = {
  action: { key: 'a', id: 'a', kind: 'action', title: '同名素材', video: '/depth.mp4', image: '', audio: '', description: '', tags: [], badge: '深度视频' },
  scripts: [{ id: 's', title: '同名素材', videoUrl: '/source.mp4', depthVideoUrl: '/previous.mp4', videoHash: '', status: 'verified', model: '', promptVersion: '', version: 1, useCount: 0, updatedAt: '', script: { durationSec: 8 } as ComponentProps<typeof SalesActionLinkDialog>['scripts'][number]['script'] }],
  onClose: vi.fn(), onSaved: vi.fn(),
};
function render() { hooks.index = 0; return SalesActionLinkDialog(props); }
const confirm = () => find(render(), (node) => node.type === 'button' && String(node.props.className).includes('sales-collect-primary'));
function choose() { (find(render(), (node) => node.type === 'select').props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 's' } }); }
beforeEach(() => { hooks.index = 0; hooks.slots = []; vi.resetAllMocks(); });

it('requires an explicit script choice, prevents duplicate saves, and writes only the video association', async () => {
  let resolve!: (value: typeof props.scripts[number]) => void;
  vi.mocked(patchSalesScript).mockReturnValue(new Promise((done) => { resolve = done; }));
  expect(confirm().props.disabled).toBe(true);
  choose();
  expect(find(render(), (node) => node.props.className === 'sales-asset-hint is-warn').props.children).toContain('替换');
  (confirm().props.onClick as () => void)();
  (confirm().props.onClick as () => void)();
  expect(patchSalesScript).toHaveBeenCalledExactlyOnceWith('s', { depthVideoUrl: '/depth.mp4', depthTaskId: '', depthOperationId: '' });
  const cancel = vi.fn();
  (render().props.onCancel as (event: { preventDefault: () => void }) => void)({ preventDefault: cancel });
  expect(props.onClose).not.toHaveBeenCalled();
  const saved = { ...props.scripts[0], depthVideoUrl: '/depth.mp4', version: 2 };
  resolve(saved);
  await vi.waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(saved));
  expect(props.onClose).toHaveBeenCalledOnce();
});

it('retains the selected script after a failed association so it can be retried', async () => {
  vi.mocked(patchSalesScript).mockRejectedValueOnce(new Error('保存失败')).mockResolvedValueOnce(props.scripts[0]);
  choose(); (confirm().props.onClick as () => void)();
  await vi.waitFor(() => expect(find(render(), (node) => node.props.role === 'alert').props.children).toBe('保存失败'));
  expect(props.onClose).not.toHaveBeenCalled();
  expect(find(render(), (node) => node.type === 'select').props.value).toBe('s');
  (confirm().props.onClick as () => void)();
  await vi.waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
});
