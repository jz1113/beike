import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@client/shared/api/apiClient';
import { SystemConfigResponseSchema } from '@shared/contracts';

export const systemConfigQueryKey = ['system', 'config'] as const;

export function useSystemConfigQuery(enabled = true) {
  return useQuery({
    queryKey: systemConfigQueryKey,
    queryFn: async () => {
      const res = await apiFetch('/api/system/config');
      if (!res.ok) throw new Error(`配置加载失败 (${res.status})`);
      const json = await res.json();
      const parsed = SystemConfigResponseSchema.safeParse(json);
      return parsed.success ? parsed.data : json;
    },
    enabled,
    staleTime: 60_000,
  });
}
