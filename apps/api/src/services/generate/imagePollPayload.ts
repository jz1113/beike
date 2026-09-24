type RecordValue = Record<string, unknown>;
const ongoing = new Set(['NOT_START', 'SUBMITTED', 'IN_PROGRESS', 'PENDING', 'PROCESSING', 'QUEUED', 'RUNNING']);
const success = new Set(['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'FINISHED', 'DONE']);
const failure = new Set(['FAILURE', 'FAILED', 'ERROR', 'CANCELLED', 'CANCELED', 'EXPIRED']);
const record = (value: unknown): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const validImage = (value: unknown): string => typeof value === 'string' && /^(https?:\/\/|\/\/|\/storage\/|data:image\/)/i.test(value.trim()) ? value.trim() : '';

/** Query errors are not generation failures. Only explicit task states or an actual image qualify. */
export function parseImagePollPayload(payload: unknown, httpOk = true): {
  status: 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS'; resultUrl: string; failReason: string; progress: string;
} | null {
  if (!httpOk) return null;
  const nodes: RecordValue[] = [];
  let resultUrl = '';
  const visit = (value: unknown, depth: number) => {
    if (depth > 6) return;
    if (typeof value === 'string') {
      const url = validImage(value);
      if (url) { resultUrl ||= url; return; }
      if (/^\s*[{[]/.test(value)) { try { visit(JSON.parse(value), depth + 1); } catch { /* non-JSON output */ } }
      return;
    }
    if (Array.isArray(value)) { value.slice(0, 8).forEach((entry) => visit(entry, depth + 1)); return; }
    if (!record(value)) return;
    nodes.push(value);
    for (const key of ['resultUrl', 'url', 'image_url']) {
      resultUrl ||= validImage(value[key]);
      if (key === 'image_url' && record(value[key])) resultUrl ||= validImage(value[key].url);
    }
    if (!resultUrl && typeof value.b64_json === 'string' && value.b64_json) resultUrl = `data:image/png;base64,${value.b64_json}`;
    for (const key of ['data', 'result', 'output', 'outputs', 'images']) visit(value[key], depth + 1);
  };
  visit(payload, 0);
  // Task state inside data/result takes precedence over the envelope's status: "success".
  const task = [...nodes].reverse().find((node) => {
    const status = String(node.status || '').toUpperCase();
    return ongoing.has(status) || success.has(status) || failure.has(status);
  });
  const rawStatus = String(task?.status || '').toUpperCase();
  if (!task && !resultUrl) return null;
  if (resultUrl) return { status: 'SUCCESS', resultUrl, progress: '100%', failReason: '' };
  if (rawStatus === 'ERROR' && !task?.task_id && !task?.taskId && !task?.id && !task?.fail_reason && !task?.failReason) return null;
  if (failure.has(rawStatus)) {
    const reason = task?.fail_reason || task?.failReason || (record(task?.error) ? task.error.message : task?.error) || task?.message;
    return { status: 'FAILURE', resultUrl: '', progress: '0%', failReason: typeof reason === 'string' && reason ? reason : '上游明确返回任务失败' };
  }
  const rawProgress = task?.progress;
  const progress = typeof rawProgress === 'number' && Number.isFinite(rawProgress) ? `${Math.min(100, Math.max(0, rawProgress))}%`
    : typeof rawProgress === 'string' && /^\d+(\.\d+)?%?$/.test(rawProgress) ? `${rawProgress.replace(/%$/, '')}%` : '';
  return { status: 'IN_PROGRESS', resultUrl: '', progress, failReason: '' };
}
