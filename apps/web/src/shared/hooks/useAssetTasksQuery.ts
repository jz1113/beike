import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { GenerationTask } from '@/types/app-store';
import { useAppStore } from '@/store';
import { fetchAssetTasks } from '@/shared/api/generationApi';
import { isImageTaskActive } from '@beike/domain/taskStatus';

export const assetTasksQueryKey = ['assets', 'tasks'] as const;

/** 服务端任务列表由 Query 持有；Zustand 只保留本地引擎草稿，不再双写 DB 列表。 */
export function useAssetTasksQuery(page = 1, enabled = true) {
  const query = useQuery({
    queryKey: [...assetTasksQueryKey, page],
    queryFn: () => fetchAssetTasks(page),
    enabled,
    // 同一任务列表会被生成页与资产页共用。短暂切换页面时优先复用缓存，
    // 生成完成事件仍会立即刷新，不牺牲最新结果的可见性。
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    refetchInterval: (q) => {
      const serverTasks = q.state.data?.tasks || [];
      const memoryTasks = useAppStore.getState().generationTasks || [];
      const hasServerOngoing = serverTasks.some(
        (t: GenerationTask) => isImageTaskActive(t.status) && !t.resultUrl && Boolean(t.taskId),
      );
      const hasMemoryOngoing = memoryTasks.some(
        (t: GenerationTask) => isImageTaskActive(t.status) && !t.resultUrl,
      );
      return (hasServerOngoing || hasMemoryOngoing) ? 2000 : false;
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const handleCompleted = () => {
      void query.refetch();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('azhuo:generation-completed', handleCompleted);
      return () => window.removeEventListener('azhuo:generation-completed', handleCompleted);
    }
  }, [enabled, query.refetch]);

  return query;
}
