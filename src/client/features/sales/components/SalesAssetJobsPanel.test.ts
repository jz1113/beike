import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import type { SalesAssetViewJob } from '@shared/contracts/salesAssetViews';
import { listSalesAssetJobs, submitSalesAssetJob } from '../api/salesAssetJobs';
import { createSalesMaterial } from '../api/salesMaterials';
import { SalesAssetJobsPanel } from './SalesAssetJobsPanel';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effects: new Map<number, { deps: readonly unknown[]; cleanup?: () => void }>() }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => (() => void), deps: readonly unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.effects.get(index);
    if (previous && deps.length === previous.deps.length && deps.every((value, position) => Object.is(value, previous.deps[position]))) return;
    previous?.cleanup?.();
    hooks.effects.set(index, { deps, cleanup: effect() });
  },
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
vi.mock('../api/salesAssetJobs', () => ({ listSalesAssetJobs: vi.fn(), submitSalesAssetJob: vi.fn() }));
vi.mock('../api/salesMaterials', () => ({ createSalesMaterial: vi.fn() }));
vi.mock('@client/shared/api/assetLibraryCache', () => ({ invalidateGlobalAssetCache: vi.fn() }));

type Node = ReactElement<Record<string, unknown>>;
const onSaved = vi.fn();
function Render() { hooks.index = 0; return SalesAssetJobsPanel({ onSaved }); }
function findAll(predicate: (node: Node) => boolean): Node[] {
  const root = Render(); const queue: Node[] = root ? [root as Node] : []; const found: Node[] = [];
  while (queue.length) {
    const node = queue.shift()!;
    if (predicate(node)) found.push(node);
    Children.forEach(node.props.children as ReactNode, (child) => { if (isValidElement<Record<string, unknown>>(child)) queue.push(child); });
  }
  return found;
}
const button = (label: string) => findAll((node) => node.type === 'button' && Children.toArray(node.props.children as ReactNode).includes(label))[0];
const statusRows = () => findAll((node) => node.type === 'div' && node.props.role === 'status');
function job(patch: Partial<SalesAssetViewJob> = {}): SalesAssetViewJob {
  return { id: 'job-original', key: 'stable-submission-key', kind: 'persona', name: '人物1', assetId: 'existing-persona-1', model: 'chosen-reference-model', status: 'queued', error: '', images: {}, createdAt: '', updatedAt: '', ...patch };
}

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.effects.clear(); vi.clearAllMocks(); vi.useFakeTimers();
});
afterEach(() => { hooks.effects.forEach(({ cleanup }) => cleanup?.()); vi.useRealTimers(); });

it('refreshes assets and invalidates their cache once when polling observes a completed task', async () => {
  const queued = job(); const completed = job({ status: 'completed' });
  vi.mocked(listSalesAssetJobs).mockResolvedValueOnce([queued]).mockResolvedValue([completed]);
  expect(Render()).toBeNull();
  await vi.advanceTimersByTimeAsync(0);
  expect(statusRows()).toHaveLength(1);
  expect(onSaved).not.toHaveBeenCalled(); expect(invalidateGlobalAssetCache).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(3000);
  expect(onSaved).toHaveBeenCalledOnce(); expect(invalidateGlobalAssetCache).toHaveBeenCalledOnce();
  expect(findAll((node) => node.type === 'span' && Children.toArray(node.props.children as ReactNode).includes('已自动保存到资产库'))).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(6000);
  expect(listSalesAssetJobs).toHaveBeenCalledTimes(4);
  expect(onSaved).toHaveBeenCalledOnce(); expect(invalidateGlobalAssetCache).toHaveBeenCalledOnce();
});

it('resumes a failed task with its original key, model and existing asset without creating another asset', async () => {
  const failed = job({ status: 'failed', error: '裁切暂时失败' });
  vi.mocked(listSalesAssetJobs).mockResolvedValueOnce([failed]).mockResolvedValue([job()]);
  vi.mocked(submitSalesAssetJob).mockResolvedValue(job());
  Render(); await vi.advanceTimersByTimeAsync(0);
  (button('继续处理原任务').props.onClick as () => void)();
  expect(submitSalesAssetJob).toHaveBeenCalledWith('persona', { key: failed.key, model: failed.model, assetId: failed.assetId, references: [] }, {}, failed.assetId);
  expect(createSalesMaterial).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(0);
  Render(); await vi.advanceTimersByTimeAsync(0);
  expect(listSalesAssetJobs).toHaveBeenCalledTimes(2);
  expect(button('继续处理原任务')).toBeUndefined();
  expect(onSaved).not.toHaveBeenCalled();
});

it('expands a batch of fifty tasks beyond the default eight and can collapse it again', async () => {
  const jobs = Array.from({ length: 50 }, (_, index) => job({ id: `job-${index}`, assetId: `persona-${index}`, name: `人物${index + 1}` }));
  vi.mocked(listSalesAssetJobs).mockResolvedValue(jobs);
  Render(); await vi.advanceTimersByTimeAsync(0);
  expect(statusRows()).toHaveLength(8);
  (button('查看全部 50 项任务').props.onClick as () => void)();
  expect(statusRows()).toHaveLength(50);
  expect(findAll((node) => node.type === 'span' && Children.toArray(node.props.children as ReactNode).includes('人物50'))).toHaveLength(1);
  (button('收起任务').props.onClick as () => void)();
  expect(statusRows()).toHaveLength(8);
});
