import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
const fetchDetail = vi.hoisted(() => vi.fn());
vi.mock('../assetLibraryCache', () => ({ fetchAssetDetail: fetchDetail }));
import { useAssetDetail } from './useAssetDetail';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('clears a stale spinner when switching from an incomplete item to a complete one', async () => {
  let complete!: (value: Record<string, unknown>) => void;
  fetchDetail.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const { result } = renderHook(() => useAssetDetail({ activeSubTab: 'full_prompt' }));
  act(() => result.current.openDetailItem({ id: 'old' }));
  await waitFor(() => expect(result.current.detailLoading).toBe(true));
  act(() => result.current.openDetailItem({ id: 'new', reversePromptZh: '完整提示词' }));
  expect(result.current.detailLoading).toBe(false);
  await act(async () => complete({ id: 'old', reversePromptZh: '迟到的提示词' }));
  expect(result.current.detailItem.id).toBe('new');
});
it('does not refetch indefinitely when full details still contain no prompt', async () => {
  fetchDetail.mockResolvedValue({ id: 'empty', title: '空素材' });
  const { result } = renderHook(() => useAssetDetail({ activeSubTab: 'full_prompt' }));
  act(() => result.current.openDetailItem({ id: 'empty' }));
  await waitFor(() => expect(result.current.detailItem.title).toBe('空素材'));
  expect(result.current.detailLoading).toBe(false);
  expect(fetchDetail).toHaveBeenCalledTimes(1);
});
