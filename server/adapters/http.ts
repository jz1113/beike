/** 标准 Web Response 辅助（替代 NextResponse） */
export function jsonResponse(
  data: unknown,
  init?: number | ResponseInit,
): Response {
  if (typeof init === 'number') {
    return Response.json(data, { status: init });
  }
  return Response.json(data, init);
}

/** Hono handler 包装：直接返回 route handler 的 Response */
export async function toHonoResponse(res: Response): Promise<Response> {
  return res;
}
