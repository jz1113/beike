import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';
import { convertToStandardJpegDataUrl } from '@beike/server-kit/imageConverter';
import { allowClientCustomBaseUrl } from '@beike/domain/gatewayCreds';

export function getDefaultBaseUrl(): string {
  return process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
}

export function getDefaultApiKey(): string {
  return process.env.AI_DRAWING_API_KEY || '';
}

const NETWORK_ERROR_RE = /(fetch failed|failed to fetch|networkerror|network request failed|econnreset|econnrefused|enotfound|etimedout|eai_again|socket hang up)/i;

export { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';

/**
 * 获取请求使用的 Base URL 和 API Key (优先使用客户端自定义配置)
 */
export function resolveCredentials(req: Request, body?: any) {
  const url = new URL(req.url);
  const customApiKey =
    body?.customApiKey ||
    req.headers.get('x-custom-api-key') ||
    url.searchParams.get('customApiKey') ||
    undefined;
  const customBaseUrl = allowClientCustomBaseUrl()
    ? (body?.customBaseUrl ||
        req.headers.get('x-custom-base-url') ||
        url.searchParams.get('customBaseUrl') ||
        undefined)
    : undefined;

  const baseUrl = normalizeGatewayBaseUrl(
    (customBaseUrl && customBaseUrl.trim())
      ? customBaseUrl
      : getDefaultBaseUrl()
  );
  const apiKey = (customApiKey && customApiKey.trim()) ? customApiKey.trim() : getDefaultApiKey();

  return { baseUrl, apiKey };
}

export function isNetworkLikeError(err: unknown): boolean {
  if (!err) return false;
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.name || '', err.message || '');
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause) parts.push(String(cause));
  } else {
    parts.push(String(err));
  }
  return NETWORK_ERROR_RE.test(parts.filter(Boolean).join(' | '));
}

export function getRetryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, attempt);
  const base = 500 * (2 ** safeAttempt);
  const jitter = Math.min(250, safeAttempt * 50);
  return base + jitter;
}

export function shouldUseEditsSubmit(url: string): boolean {
  return /\/v1\/images\/edits(?:\?|$)/i.test(url);
}

export function buildImageSubmitCandidates(baseCandidates: string[], useEdits: boolean, baseUrl: string): string[] {
  const cleanBase = normalizeGatewayBaseUrl(baseUrl);
  const candidates = [...(baseCandidates || [])];

  if (useEdits) {
    if (!candidates.some((u) => /\/v1\/images\/edits\?async=true/i.test(u))) {
      candidates.push(`${cleanBase}/v1/images/edits?async=true`);
    }
    if (!candidates.some((u) => /\/v1\/images\/edits(?:\?|$)/i.test(u) && !u.includes('?async=true'))) {
      candidates.push(`${cleanBase}/v1/images/edits`);
    }
    if (!candidates.some((u) => /\/v1\/images\/generations/i.test(u))) {
      candidates.push(`${cleanBase}/v1/images/generations?async=true`);
      candidates.push(`${cleanBase}/v1/images/generations`);
    }
  } else {
    if (!candidates.some((u) => /\/v1\/images\/generations\?async=true/i.test(u))) {
      candidates.push(`${cleanBase}/v1/images/generations?async=true`);
    }
    if (!candidates.some((u) => /\/v1\/images\/generations(?:\?|$)/i.test(u) && !u.includes('?async=true'))) {
      candidates.push(`${cleanBase}/v1/images/generations`);
    }
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  opts?: {
    maxAttempts?: number;
    onRetry?: (attempt: number, delayMs: number, error: unknown) => void | Promise<void>;
  }
): Promise<Response> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 2);
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await fetch(input, init);
      if (isRetryableHttpStatus(res.status) && attempt < maxAttempts - 1) {
        const delayMs = getRetryDelayMs(attempt);
        await opts?.onRetry?.(attempt + 1, delayMs, new Error(`HTTP ${res.status}`));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      if (!isNetworkLikeError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      const delayMs = getRetryDelayMs(attempt);
      await opts?.onRetry?.(attempt + 1, delayMs, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'fetch failed'));
}

/**
 * 远程垫图与防盗链资源安全拉取并转化为 Base64 Data URL (统一转为标准 JPEG 格式)
 * 彻底杜绝 AVIF 等格式导致下游绘图网关报 'input image data is not a recognizable image' 错误
 */
export async function fetchImageAsSafeDataUrl(rawUrl?: string | null): Promise<string | undefined> {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  return convertToStandardJpegDataUrl(rawUrl);
}

/** Edits 网关要求 multipart/form-data + binary image，禁止 JSON 直传 data URL */
export function dataUrlToBlobFile(dataUrl: string, index: number): { blob: Blob; filename: string } | null {
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const mime = (match[1] || 'image/jpeg').toLowerCase();
  const buf = Buffer.from(match[2], 'base64');
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return { blob: new Blob([buf], { type: mime }), filename: `image_${index}.${ext}` };
}

export function buildEditsMultipart(payload: Record<string, unknown>, imageDataUrls: string[], opts?: { allowDuplicateFace?: boolean }) {
  const form = new FormData();
  let bytesApprox = 0;
  let imageAppended = 0;
  for (const key of ['prompt', 'model', 'size', 'quality', 'n', 'response_format']) {
    const v = payload[key];
    if (v === undefined || v === null || v === '') continue;
    const s = String(v);
    form.append(key, s);
    bytesApprox += Buffer.byteLength(s, 'utf8');
  }
  const seen = new Set<string>();
  for (const raw of imageDataUrls) {
    if (!raw || !raw.startsWith('data:')) continue;
    // 身份加权时允许同一正脸板连续出现两次；其它情况仍去重防误传
    if (!opts?.allowDuplicateFace && seen.has(raw)) continue;
    if (seen.has(raw) && opts?.allowDuplicateFace) {
      // 仅允许「已见过一次后再追加一次」
      const dupKey = `${raw}#dup`;
      if (seen.has(dupKey)) continue;
      seen.add(dupKey);
    } else {
      seen.add(raw);
    }
    const file = dataUrlToBlobFile(raw, imageAppended);
    if (!file) continue;
    form.append('image', file.blob, file.filename);
    bytesApprox += file.blob.size;
    imageAppended += 1;
  }
  return { form, bytesApprox, imageAppended };
}

/**
 * POST /api/generate/image
 * 提交异步生图任务
 */
