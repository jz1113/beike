import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { GenerationTask } from '@/types/app-store';
import { useAppStore } from '@/store';
import { fetchAssetTasks } from '@/shared/api/generationApi';

export const assetTasksQueryKey = ['assets', 'tasks'] as const;

/** 服务端任务列表由 Query 持有；Zustand 只保留本地引擎草稿，不再双写 DB 列表。 */
export function useAssetTasksQuery(page = 1, enabled = true) {
  const query = useQuery({
    queryKey: [...assetTasksQueryKey, page],
    queryFn: () => fetchAssetTasks(page),
    enabled,
    placeholderData: (previousData) => previousData,
    refetchInterval: (q) => {
      const serverTasks = q.state.data?.tasks || [];
      const memoryTasks = useAppStore.getState().generationTasks || [];
      const hasServerOngoing = serverTasks.some(
        (t: GenerationTask) =>
          (t.status === 'IN_PROGRESS' || t.status === 'IDLE') && !t.resultUrl && Boolean(t.taskId),
      );
      const hasMemoryOngoing = memoryTasks.some(
        (t: GenerationTask) =>
          (t.status === 'IN_PROGRESS' || t.status === 'IDLE') && !t.resultUrl,
      );
      return (hasServerOngoing || hasMemoryOngoing) ? 2000 : false;
    },
  });

  useEffect(() => {
    const handleCompleted = () => {
      void query.refetch();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('azhuo:generation-completed', handleCompleted);
      return () => window.removeEventListener('azhuo:generation-completed', handleCompleted);
    }
  }, [query]);

  return query;
}
