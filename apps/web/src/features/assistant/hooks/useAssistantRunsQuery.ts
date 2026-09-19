import { useQuery } from '@tanstack/react-query';
import { fetchAssistantRuns, recoverAssistantTurn, type ActiveRun } from '../api/runs';

export const assistantRunsQueryKey = ['assistant', 'runs'] as const;
export type { ActiveRun };

export function useAssistantRunsQuery(enabled = true) {
  return useQuery({
    queryKey: assistantRunsQueryKey,
    queryFn: fetchAssistantRuns,
    enabled,
    refetchInterval: 5000,
  });
}

export { recoverAssistantTurn };
