import createClient from 'openapi-fetch';
import type { paths } from './openapi-types';
import { apiFetch } from './apiClient';

type HttpVerb = 'get' | 'post' | 'put' | 'patch' | 'delete';
type AllowedMethod<P extends keyof paths> = {
  [M in HttpVerb]: paths[P][M] extends never ? never : Uppercase<M>;
}[HttpVerb];

function browserOrigin(): string {
  if (typeof location !== 'undefined' && location.origin) return location.origin;
  return 'http://127.0.0.1';
}

/** 由 src/shared/contracts/openapi.yaml 生成的客户端。自定义 fetch 继续走现有鉴权头。 */
export const openApi = createClient<paths>({
  baseUrl: browserOrigin(),
  fetch: (input) => apiFetch(input),
});

export async function apiRequest<P extends keyof paths>(
  method: AllowedMethod<P>,
  path: P,
  init?: RequestInit & { pathParams?: Record<string, string>; search?: string },
): Promise<Response> {
  let pathname = String(path);
  for (const [key, value] of Object.entries(init?.pathParams ?? {})) {
    pathname = pathname.replaceAll(`{${key}}`, encodeURIComponent(value));
  }
  if (pathname.includes('{')) throw new Error(`接口路径参数未替换：${pathname}`);
  const search = init?.search ? (init.search.startsWith('?') ? init.search : `?${init.search}`) : '';
  const requestInit: RequestInit & { pathParams?: Record<string, string>; search?: string } = { ...(init ?? {}) };
  delete requestInit.pathParams;
  delete requestInit.search;
  return apiFetch(`${pathname}${search}`, { ...requestInit, method });
}
