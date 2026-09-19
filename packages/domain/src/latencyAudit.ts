/**
 * 模型调用耗时审计：分阶段日志（上传转码 / 网关提交 / 客户端往返 / 出图完成）
 * 不记录 API Key / 完整图片内容。
 * 仅当 LATENCY_AUDIT=1 时 POST 到 ingest；默认 no-op。
 */
import { domainEnv, domainFetch } from './runtime';

export type LatencyAuditPayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
};

function isAuditEnabled(): boolean {
  const ingest = domainEnv('LATENCY_AUDIT_ENDPOINT') || '';
  return domainEnv('LATENCY_AUDIT') === '1' && Boolean(ingest);
}

export function logLatencyAudit(payload: LatencyAuditPayload): void {
  if (!isAuditEnabled()) return;
  const ingest = domainEnv('LATENCY_AUDIT_ENDPOINT') || '';
  const session = domainEnv('LATENCY_AUDIT_SESSION') || 'default';

  const body = {
    sessionId: session,
    runId: payload.runId || 'latency-audit',
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data || {},
    timestamp: Date.now(),
  };

  try {
    void domainFetch(ingest, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': session,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** 同一输入只转码一次，避免 product/reference/images 重复 sharp */
export function createImageConvertCache(
  convert: (raw?: string | null) => Promise<string | undefined>
) {
  const cache = new Map<string, Promise<string | undefined>>();
  return (raw?: string | null): Promise<string | undefined> => {
    if (!raw || typeof raw !== 'string') return Promise.resolve(undefined);
    const key = raw.trim();
    if (!key) return Promise.resolve(undefined);
    const hit = cache.get(key);
    if (hit) return hit;
    const p = convert(key);
    cache.set(key, p);
    return p;
  };
}
