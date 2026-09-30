/**
 * 流式读取 Response body，累计字节超过上限时主动 cancel。
 */
export async function readResponseBodyLimited(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; reason: 'too_large' | 'empty' | 'no_body' }> {
  if (signal?.aborted) {
    await response.body?.cancel().catch(() => undefined);
    signal.throwIfAborted();
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const len = Number.parseInt(contentLength, 10);
    if (Number.isFinite(len) && len > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, reason: 'too_large' };
    }
  }

  if (!response.body) {
    return { ok: false, reason: 'no_body' };
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });

  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    await reader.cancel().catch(() => {});
    signal?.throwIfAborted();
    throw new Error('读取响应体失败');
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }

  if (total === 0) {
    return { ok: false, reason: 'empty' };
  }

  return { ok: true, buffer: Buffer.concat(chunks) };
}
