import { AppError, errorResponse, successEnvelope } from './errors';

/**
 * JSON 路由统一入口。二进制 / 流式响应不要走这里，继续直接 `new Response`：
 * - routes/system/local-media.ts
 * - routes/system/proxy-image*
 * - routes/assistant/media.ts
 */
export function asJsonRoute(
  fn: (req: Request) => Promise<Response> | Response,
) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function asParamJsonRoute<T extends string[]>(
  fn: (req: Request, ...params: T) => Promise<Response> | Response,
) {
  return async (req: Request, ...params: T) => {
    try {
      return await fn(req, ...params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function jsonOk<T extends Record<string, unknown>>(data: T, init?: number | ResponseInit) {
  if (typeof init === 'number') return successEnvelope(data, init);
  const status = init?.status ?? 200;
  const response = successEnvelope(data, status);
  if (!init?.headers) return response;
  const headers = new Headers(response.headers);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

export function jsonFail(message: string, status = 400, code = 'bad_request') {
  return errorResponse(new AppError(message, status, code));
}

export function mountJson(
  fn: (req: Request) => Promise<Response> | Response,
) {
  const wrapped = asJsonRoute(fn);
  return (c: { req: { raw: Request } }) => wrapped(c.req.raw);
}
