import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { libraryPreferencesSchema, type LibraryPreferences } from '@shared/contracts/sharedMaterials';
import { apiRequest } from './apiRequest';

const key = ['library-preferences'] as const;
const endpoint = '/api/library/preferences';

async function preferencesResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '无法读取工作区资产库设置');
  return libraryPreferencesSchema.parse(data);
}

export function useLibraryPreferences() {
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => preferencesResponse(await apiRequest('GET', endpoint, { signal })),
  });
}

export function useUpdateLibraryPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<LibraryPreferences>) => preferencesResponse(await apiRequest('PATCH', endpoint, {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })),
    onSuccess: async (preferences, patch) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData(key, preferences);
      if (patch.sharingEnabled !== undefined) {
        await client.cancelQueries({ queryKey: ['shared-materials'] });
        await client.invalidateQueries({ queryKey: ['shared-materials'] });
      }
    },
  });
}
