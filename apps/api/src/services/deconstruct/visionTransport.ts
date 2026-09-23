import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/** Node fetch/undici 在部分服务器到视觉网关的连接上会建连超时。 */
export function postVisionJson(
  url: string,
  options: { headers: Record<string, string>; body: string; signal: AbortSignal }
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = target.protocol === 'https:' ? httpsRequest : target.protocol === 'http:' ? httpRequest : null;
    if (!request) {
      reject(new Error(`不支持的视觉网关协议: ${target.protocol}`));
      return;
    }

    const req = request(target, {
      method: 'POST',
      headers: {
        ...options.headers,
        'Content-Length': Buffer.byteLength(options.body),
      },
      signal: options.signal,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        resolve(new Response(Buffer.concat(chunks), {
          status: res.statusCode || 502,
          statusText: res.statusMessage,
          headers: res.headers as HeadersInit,
        }));
      });
    });

    req.on('error', reject);
    req.end(options.body);
  });
}
