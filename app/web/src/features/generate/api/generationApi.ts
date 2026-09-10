import { apiFetch } from '@/lib/apiClient';
import { AssetTasksListResponseSchema } from '@beike/contracts/generate';
import type { GenerationTask } from '@/types/app-store';
import { mapDbTaskToGenerationTask } from './mapDbTask';

export async function fetchAssetTasks(page = 1, pageSize = 40): Promise<{
  tasks: GenerationTask[];
  total: number;
}> {
  const res = await apiFetch(`/api/assets/tasks?page=${page}&pageSize=${pageSize}&detail=true`);
  if (!res.ok) {
    throw new Error(`资产任务列表请求失败 (${res.status})`);
  }
  const json = await res.json();
  const parsed = AssetTasksListResponseSchema.safeParse(json);
  const rawTasks = parsed.success
    ? (parsed.data.tasks || parsed.data.items || [])
    : (json.tasks || json.items || []);

  const tasks = (rawTasks as Record<string, unknown>[]).map(mapDbTaskToGenerationTask);

  return {
    tasks,
    total: parsed.success ? (parsed.data.total ?? tasks.length) : tasks.length,
  };
}

export async function pollGenerationTask(
  taskId: string,
  mediaType: 'image' | 'video' = 'image',
) {
  const endpoint = mediaType === 'video' ? '/api/generate/video' : '/api/generate/image';
  const res = await apiFetch(`${endpoint}?taskId=${encodeURIComponent(taskId)}`);
  if (!res.ok) {
    throw new Error(`轮询失败 (${res.status})`);
  }
  return res.json();
}
