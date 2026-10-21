import { apiFetch, readClientStorageConfig, storageConfigHeaders } from './apiClient';

export async function uploadStudioFile(file: File, category: string, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  form.append('customConfig', JSON.stringify(readClientStorageConfig()));
  const res = await apiFetch('/api/assets/storage/upload', {
    method: 'POST',
    signal,
    headers: storageConfigHeaders(),
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !data.url) {
    throw new Error(typeof data.error === 'string' ? data.error : '文件上传失败');
  }
  return String(data.url);
}
