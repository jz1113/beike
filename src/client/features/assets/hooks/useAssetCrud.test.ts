import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssetCrud, type UseAssetCrudOptions } from './useAssetCrud';
import { apiFetch } from '@client/shared/api/apiClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';

const hooks = vi.hoisted(() => ({ cursor: 0, refs: [] as Array<{ current: unknown }> }));
vi.mock('react', () => ({
  useState: (value: unknown) => [value, vi.fn()],
  useRef: (current: unknown) => {
    const slot = hooks.cursor++;
    return hooks.refs[slot] ?? (hooks.refs[slot] = { current });
  },
}));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/api/assetLibraryCache', () => ({ invalidateGlobalAssetCache: vi.fn() }));

function Harness() {
  const options: UseAssetCrudOptions = {
    activeSubTab: 'full_prompt', items: [{ id: 'group-1' }], selectedIds: ['group-1'],
    setItems: vi.fn(), setSelectedIds: vi.fn(), setIsBatchMode: vi.fn(),
    detailItem: null, setDetailItem: vi.fn(), showToast: vi.fn(), fetchAssets: vi.fn().mockResolvedValue(undefined),
  };
  return { options, actions: useAssetCrud(options) };
}

beforeEach(() => {
  hooks.cursor = 0; hooks.refs = []; vi.clearAllMocks();
  vi.stubGlobal('window', { confirm: vi.fn().mockReturnValue(true) });
  vi.stubGlobal('alert', vi.fn());
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ success: true, count: 1 }));
});
afterEach(() => vi.unstubAllGlobals());

describe('素材批量删除', () => {
  it('取消确认时保留素材和选择', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const { options, actions } = Harness();
    await actions.handleBatchDelete();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(options.setItems).not.toHaveBeenCalled();
    expect(options.setSelectedIds).not.toHaveBeenCalled();
  });

  it('请求未结束时拒绝重复提交，成功后退出管理模式', async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(apiFetch).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const { options, actions } = Harness();
    const pending = actions.handleBatchDelete();
    await actions.handleBatchDelete();
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(options.setItems).not.toHaveBeenCalled();
    resolve(Response.json({ success: true, count: 1 }));
    await pending;
    expect(options.setItems).toHaveBeenCalledOnce();
    expect(options.setIsBatchMode).toHaveBeenCalledWith(false);
  });

  it('失败保留已选素材并释放提交锁，允许重试', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: false, error: '删除失败' }, { status: 500 }));
    const { options, actions } = Harness();
    await actions.handleBatchDelete();
    expect(options.setItems).not.toHaveBeenCalled();
    expect(options.setSelectedIds).not.toHaveBeenCalled();
    await actions.handleBatchDelete();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(options.setItems).toHaveBeenCalledOnce();
  });

  it('请求期间切换素材类型时不覆盖新页面的列表与选择', async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(apiFetch).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const { options, actions } = Harness();
    const pending = actions.handleBatchDelete();
    hooks.cursor = 0;
    useAssetCrud({ ...options, activeSubTab: 'persona' });
    resolve(Response.json({ success: true, count: 1 }));
    await pending;
    expect(invalidateGlobalAssetCache).toHaveBeenCalledOnce();
    expect(options.setItems).not.toHaveBeenCalled();
    expect(options.setSelectedIds).not.toHaveBeenCalled();
    expect(options.setIsBatchMode).not.toHaveBeenCalled();
  });
});
