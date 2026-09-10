/** Accept a gateway root or OpenAI /v1 base while preserving reverse-proxy prefixes. */
export function normalizeGatewayBaseUrl(raw?: string | null): string {
  return String(raw || '').trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}
