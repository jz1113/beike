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
