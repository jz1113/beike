import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { GenerationTask } from '@/types/app-store';
import { useAppStore } from '@/store/useAppStore';
import { fetchAssetTasks } from '@/features/generate/api/generationApi';

export const assetTasksQueryKey = ['assets', 'tasks'] as const;

/** 资产中心 / 全局任务列表：服务端状态由 Query 管理，结果同步到 Zustand */
export function useAssetTasksQuery(page = 1, enabled = true) {
  const syncDatabaseTasks = useAppStore((s) => s.syncDatabaseTasks);

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
    if (query.data?.tasks?.length) {
      syncDatabaseTasks(query.data.tasks);
    }
  }, [query.data, syncDatabaseTasks]);

  // 监听任务完成全局广播，立即刷新服务端任务
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
