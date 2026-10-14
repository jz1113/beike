import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAssetTasks } from '@client/shared/api/generation/generationApi';
import { assetTasksQueryKey } from '@client/shared/api/assetQueryKeys';
import { getAssetPollingPages, getNextAssetPage, hasAssetPageMembershipChanged, loadAssetPollingPages } from '@client/shared/utils/assetTaskData';
import { useDocumentHidden } from '@client/shared/hooks/useDocumentHidden';

const PAGE_SIZE = 40;
const HISTORY_KEY = [...assetTasksQueryKey, 'history'] as const;
type AssetPage = Awaited<ReturnType<typeof fetchAssetTasks>>;
type AssetHistory = InfiniteData<AssetPage, number>;

/** One paginated cache owns history; frequent polls only refresh pages with recent ongoing jobs. */
export function useAssetHistoryQuery(enabled: boolean) {
  const documentHidden = useDocumentHidden();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery<AssetPage, Error, AssetHistory, typeof HISTORY_KEY, number>({
    queryKey: HISTORY_KEY,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchAssetTasks(pageParam, PAGE_SIZE, signal),
    getNextPageParam: (lastPage, _pages, page) => getNextAssetPage(lastPage, page, PAGE_SIZE),
    enabled,
    staleTime: 15000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  const [pollError, setPollError] = useState<Error | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollRevision, setPollRevision] = useState(0);
  const pollControllerRef = useRef<AbortController | null>(null);
  const { refetch: refetchHistory } = query;
  const refetchRef = useRef(refetchHistory);
  refetchRef.current = refetchHistory;
  const hasPollableTasks = Boolean(query.data && getAssetPollingPages(query.data.pages, query.data.pageParams).length > 0);

  const retryPolling = useCallback(() => {
    pollControllerRef.current?.abort();
    setPollError(null);
    setPollRevision((revision) => revision + 1);
  }, []);
  const refetch = useCallback((...args: Parameters<typeof refetchHistory>) => {
    retryPolling();
    return refetchHistory(...args);
  }, [refetchHistory, retryPolling]);

  useEffect(() => {
    // Unfinished jobs older than 24 hours remain visible and can still be refreshed manually.
    if (!enabled || documentHidden || !hasPollableTasks || pollError || query.isError) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const schedule = () => { timer = setTimeout(() => void poll(), 2000); };
    const poll = async () => {
      if (queryClient.isFetching({ queryKey: HISTORY_KEY, exact: true })) { schedule(); return; }
      const snapshot = queryClient.getQueryData<AssetHistory>(HISTORY_KEY);
      const pages = snapshot ? getAssetPollingPages(snapshot.pages, snapshot.pageParams) : [];
      if (!snapshot || pages.length === 0) return;
      controller = new AbortController();
      pollControllerRef.current = controller;
      setIsPolling(true);
      let failed = false;
      try {
        const updates = await loadAssetPollingPages(pages, (page) => fetchAssetTasks(page, PAGE_SIZE, controller!.signal));
        if (!active || controller.signal.aborted) return;
        // Pagination/manual refresh owns the cache while its request is running.
        if (!queryClient.isFetching({ queryKey: HISTORY_KEY, exact: true })) {
          const latest = queryClient.getQueryData<AssetHistory>(HISTORY_KEY);
          const boundariesChanged = updates.some(({ page, data }) => {
            const index = latest?.pageParams.indexOf(page) ?? -1;
            return index >= 0 && hasAssetPageMembershipChanged(latest!.pages[index], data);
          });
          if (boundariesChanged) {
            // Only a membership change warrants reloading completed pages to repair offsets.
            await refetchRef.current({ throwOnError: true });
          } else {
            queryClient.setQueryData<AssetHistory>(HISTORY_KEY, (current) => current ? {
              ...current,
              pages: current.pages.map((page, index) => updates.find((update) => update.page === current.pageParams[index])?.data || page),
            } : current);
          }
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          failed = true;
          controller.abort();
          setPollError(error instanceof Error ? error : new Error(String(error)));
        }
      } finally {
        if (active) setIsPolling(false);
      }
      if (active && !failed) schedule();
    };
    timer = setTimeout(() => void poll(), pollRevision > 0 ? 0 : 2000);
    return () => {
      active = false;
      clearTimeout(timer);
      controller?.abort();
      setIsPolling(false);
    };
  }, [enabled, documentHidden, hasPollableTasks, pollError, pollRevision, query.isError, queryClient]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onCompleted = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refetch(), 200);
    };
    window.addEventListener('azhuo:generation-completed', onCompleted);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('azhuo:generation-completed', onCompleted);
    };
  }, [enabled, refetch]);

  return { ...query, refetch, pollError, isPolling, retryPolling };
}
