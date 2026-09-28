const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function readVideoTaskId(value: unknown, family: string): string | null {
  const data = record(value);
  if (data.error) return null;
  const id = record(data.output).task_id || data.task_id || record(data.data).task_id || data.id || text(data.data)
    || (family === 'grok-video' ? data.request_id : undefined);
  return typeof id === 'string' && id.trim() ? id : typeof id === 'number' ? String(id) : null;
}

export function readNativeVideoResult(value: unknown): string {
  const data = record(value);
  const task = record(data.task || data.data || data.output || data);
  const videos = record(task.task_result).videos;
  const creations = task.creations || data.creations;
  const sources = [record(task.video).url, record(data.video).url,
    Array.isArray(videos) ? record(videos[0]).url : undefined,
    Array.isArray(creations) ? record(creations[0]).url : undefined];
  return sources.map(text).find(Boolean) || '';
}

export function videoTerminalFailure(status: string) {
  return ['FAILURE', 'FAILED', 'ERROR', 'EXPIRED', 'CANCELED', 'CANCELLED'].includes(status.toUpperCase());
}

/** Known task paths for recovery after the in-memory submission cache is lost. */
export function videoRecoveryQueryUrls(base: string, taskId: string, model: string) {
  const id = encodeURIComponent(taskId);
  if (/grok/i.test(model)) return [`${base}/xai/v1/videos/${id}`];
  if (/vidu/i.test(model)) return [`${base}/vidu/v2/tasks/${id}/creations`, `${base}/vidu/ent/v2/tasks/${id}/creations`];
  if (/kling/i.test(model)) return (model.includes('omni') ? ['omni-video'] : ['text2video', 'image2video']).map(mode => `${base}/kling/v1/videos/${mode}/${id}`);
  return [];
}
