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

export function withDeprecation(response: Response, successor = '/api/assistant/turn/start'): Response {
  const headers = new Headers(response.headers);
  headers.set('Deprecation', 'true');
  headers.set('Link', `<${successor}>; rel="successor-version"`);
  return new Response(response.body, { status: response.status, headers });
}
