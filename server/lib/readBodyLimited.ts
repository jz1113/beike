/**
 * 流式读取 Response body，累计字节超过上限时主动 cancel。
 */
export async function readResponseBodyLimited(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; reason: 'too_large' | 'empty' | 'no_body' }> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const len = Number.parseInt(contentLength, 10);
    if (Number.isFinite(len) && len > maxBytes) {
      return { ok: false, reason: 'too_large' };
    }
  }

  if (!response.body) {
    return { ok: false, reason: 'no_body' };
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
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
    throw new Error('读取响应体失败');
  }

  if (total === 0) {
    return { ok: false, reason: 'empty' };
  }

  return { ok: true, buffer: Buffer.concat(chunks) };
}
