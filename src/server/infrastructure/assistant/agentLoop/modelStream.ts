/** Decode bounded OpenAI SSE events and finish promptly on the model's terminal event. */
export async function readModelStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
  onChunk: (chunk: Record<string, any>) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  let eventChars = 0;
  let received = 0;
  const onAbort = () => { void reader.cancel(signal?.reason).catch(() => undefined); };
  signal?.addEventListener('abort', onAbort, { once: true });
  const dispatch = (): boolean => {
    if (!data.length) return false;
    const payload = data.join('\n').trim();
    data = []; eventChars = 0;
    if (!payload) return false;
    if (payload === '[DONE]') return true;
    let chunk: Record<string, any>;
    try { chunk = JSON.parse(payload); }
    catch { throw new Error('模型返回的流式数据格式异常，已生成内容已保留，请重试。'); }
    if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk) || chunk.error) throw new Error('模型返回了无效或失败的流式响应，请重试。');
    if (chunk.choices !== undefined && !Array.isArray(chunk.choices)) throw new Error('模型返回的 choices 格式异常');
    const choice = chunk.choices?.[0];
    const delta = choice?.delta;
    if (delta !== undefined && delta !== null && (typeof delta !== 'object' || Array.isArray(delta))) throw new Error('模型返回的 delta 格式异常');
    for (const key of ['content', 'reasoning_content']) if (delta?.[key] !== undefined && delta[key] !== null && typeof delta[key] !== 'string') throw new Error('模型返回的文本增量格式异常');
    if (choice?.finish_reason !== undefined && choice.finish_reason !== null && typeof choice.finish_reason !== 'string') throw new Error('模型返回的结束标志格式异常');
    onChunk(chunk);
    return Boolean(choice?.finish_reason);
  };
  // Preserve usage-only trailers already buffered with the terminal event without waiting on an open socket.
  const bufferedUsage = () => {
    for (const frame of buffer.split(/\r?\n\r?\n/)) {
      const payload = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      try {
        const chunk = JSON.parse(payload);
        if (chunk?.usage && (!chunk.choices || Array.isArray(chunk.choices) && chunk.choices.length === 0)) onChunk({ usage: chunk.usage });
      } catch { /* A trailing partial event has no authoritative usage report. */ }
    }
  };
  const line = (raw: string): boolean => {
    const value = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (!value) return dispatch();
    if (value.startsWith('data:')) {
      const text = value.slice(5).replace(/^ /, '');
      eventChars += text.length;
      if (eventChars > 1_000_000) throw new Error('模型单次流式事件过大，已停止接收');
      data.push(text);
    }
    return false;
  };
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (value) { received += value.byteLength; if (received > 8 * 1024 * 1024) throw new Error('模型流式响应超过大小限制，已停止接收'); }
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const current = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        if (line(current)) { bufferedUsage(); return; }
      }
      if (buffer.length > 1_000_000) throw new Error('模型单次流式事件过大，已停止接收');
      if (done) { if (buffer && line(buffer)) return; dispatch(); return; }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function assertModelTextLimit(text: string, increment: string): void {
  if (text.length + increment.length > 100_000) throw new Error('模型输出超过单条消息长度限制，已生成内容已保留，请分段继续。');
}
