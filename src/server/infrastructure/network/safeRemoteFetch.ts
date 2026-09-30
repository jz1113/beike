import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable, pipeline } from 'node:stream';
import { createUnzip, createBrotliDecompress } from 'node:zlib';
import { isIP } from 'node:net';
import { assertSafeRemoteUrl, isPrivateIp } from './safeUrl';

async function withAbort<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (signal?.aborted) { void work.catch(() => undefined); signal.throwIfAborted(); }
  signal?.throwIfAborted();
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    work.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

/** Pin this connection to the addresses just checked, while retaining the TLS hostname. */
async function requestPinned(url: URL, init: RequestInit): Promise<Response> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await withAbort(lookup(hostname, { all: true }), init.signal);
  init.signal?.throwIfAborted();
  if (!records.length || records.some(record => !isIP(record.address) || isPrivateIp(record.address))) throw new Error('远程地址解析到不允许的网络');
  const address = records.find(record => record.family === 4) || records[0];
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  headers.host = url.host;
  if (init.body !== undefined && init.body !== null && typeof init.body !== 'string' && !(init.body instanceof Uint8Array)) throw new Error('不支持的远程请求正文');
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: init.method || 'GET', headers, agent: false, signal: init.signal || undefined,
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    }, (incoming) => {
      try {
      const responseHeaders = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      const status = incoming.statusCode || 502;
      if (status < 200 || status > 599) { incoming.destroy(); reject(new Error('远程服务返回无效的 HTTP 状态')); return; }
      const encoding = responseHeaders.get('content-encoding')?.trim().toLowerCase();
      let source: Readable = incoming;
      if (encoding && encoding !== 'identity') {
        const decoder = encoding === 'br' ? createBrotliDecompress() : ['gzip', 'deflate'].includes(encoding) ? createUnzip() : undefined;
        if (!decoder) { incoming.destroy(); reject(new Error('不支持的远程响应压缩格式')); return; }
        pipeline(incoming, decoder, () => undefined);
        source = decoder;
        responseHeaders.delete('content-encoding'); responseHeaders.delete('content-length');
      }
      const body = [204, 205, 304].includes(status) ? null : Readable.toWeb(source, { strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength } }) as ReadableStream<Uint8Array>;
      if (!body) incoming.resume();
      resolve(new Response(body, { status, headers: responseHeaders }));
      } catch (error) { incoming.destroy(); reject(error); }
    });
    request.on('error', reject);
    if (init.body) request.write(init.body);
    request.end();
  });
}

/** Validate every redirect and bound streamed input before buffering it in memory. */
export async function fetchSafeRemoteBytes(url: string, init: RequestInit, maxBytes: number, options: { requireAllowlist?: boolean } = {}): Promise<{ response: Response; buffer: Buffer }> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('远程读取大小限制无效');
  init = { ...init, signal: init.signal || AbortSignal.timeout(30000) };
  let target = url;
  for (let redirects = 0; redirects <= 5; redirects++) {
    init.signal?.throwIfAborted();
    const parsed = await withAbort(assertSafeRemoteUrl(target, options), init.signal);
    if (parsed.username || parsed.password) throw new Error('地址不得包含账号或密码');
    const response = await requestPinned(parsed, init);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      await response.body?.cancel();
      if (!next || redirects === 5) throw new Error('远程地址重定向过多或无效');
      const redirected = new URL(next, parsed);
      const headers = new Headers(init.headers);
      if (redirected.origin !== parsed.origin && ['authorization', 'cookie', 'x-app-token', 'x-access-token', 'x-api-key', 'x-workspace-token'].some(name => headers.has(name))) throw new Error('不向其它地址转发访问凭证');
      if (response.status === 303 || [301, 302].includes(response.status) && init.method?.toUpperCase() === 'POST') {
        headers.delete('content-type'); headers.delete('content-length');
        init = { ...init, method: 'GET', body: undefined, headers };
      }
      target = redirected.href;
      continue;
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel();
      throw new Error('远程资源超过大小限制');
    }
    if (!response.body) return { response, buffer: Buffer.alloc(0) };
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      while (true) {
        init.signal?.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) { await reader.cancel(); throw new Error('远程资源超过大小限制'); }
        chunks.push(Buffer.from(chunk.value));
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally { reader.releaseLock(); }
    return { response, buffer: Buffer.concat(chunks, bytes) };
  }
  throw new Error('远程地址重定向过多');
}
