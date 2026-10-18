export type RemoteModelFetchResult =
  | { ok: true; ids: string[] }
  | { ok: false; message: string };

/** 只接受网关真实返回的目录。官方精选回退和失败响应都不能写进待同步列表。 */
export function parseRemoteModelFetch(payload: unknown): RemoteModelFetchResult {
  const body = payload && typeof payload === 'object' ? payload as {
    success?: boolean;
    isFallback?: boolean;
    error?: unknown;
    warning?: unknown;
    models?: unknown;
  } : {};
  const message = typeof body.error === 'string' && body.error.trim()
    ? body.error
    : typeof body.warning === 'string' && body.warning.trim()
      ? body.warning
      : '远端没有返回模型目录，已保留上次同步的模型';
  if (body.isFallback || body.success === false || !Array.isArray(body.models)) {
    return { ok: false, message };
  }
  const ids: string[] = [];
  for (const model of body.models) {
    if (typeof model === 'string') ids.push(model);
    else if (model && typeof model === 'object' && typeof (model as { id?: unknown }).id === 'string') {
      ids.push((model as { id: string }).id);
    }
  }
  return { ok: true, ids: Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean))) };
}
