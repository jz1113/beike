/** Decode SSE records across arbitrary UTF-8 chunks, including the last record at EOF. */
export async function* readSseEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<{ type: string; [key: string]: any }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      buffer += done ? decoder.decode() + '\n\n' : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
        if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        if (line || !data.length) continue;
        const payload = data.join('\n');
        data = [];
        if (payload === '[DONE]') {
          yield { type: 'done' };
          continue;
        }
        let event: unknown;
        try {
          event = JSON.parse(payload);
        } catch {
          throw new Error('事件格式异常，请稍后重试。');
        }
        if (!event || typeof event !== 'object' || !('type' in event) || typeof event.type !== 'string') continue;
        yield event as { type: string; [key: string]: any };
      }
      if (done) break;
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
