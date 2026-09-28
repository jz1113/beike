import { apiFetch } from '@client/shared/api/apiClient';
import type { ConnectionTestOutcome } from './connectionStatus';

/** Directory reachability only: this does not prove generation capability or balance. */
export async function testModelConnection(name: string, body: Record<string, unknown>): Promise<ConnectionTestOutcome> {
  if (!String(body.apiKey || '').trim()) return { ok: false, message: '请先填写 API Key' };
  const start = Date.now();
  const response = await apiFetch('/api/system/models/fetch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, isPing: true, strict: true }),
  });
  const data = await response.json().catch(() => ({}));
  const ok = Boolean(response.ok && data.success && !data.isFallback);
  return { ok, message: ok
    ? `${name}模型目录测试通过 · ${Date.now() - start}ms；不代表所有模型可生成或余额充足`
    : `${name}测试失败 (${data.gatewayStatus || response.status})：${data.error || data.warning || '请检查地址与密钥'}` };
}
async function testServiceConnection(name: string, body: Record<string, string>): Promise<ConnectionTestOutcome> {
  if (Object.values(body).some(value => !value.trim())) return { ok: false, message: `请先填写${name}所需凭证` };
  const response = await apiFetch('/api/system/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  const ok = Boolean(response.ok && data.success && data.parseOk !== false);
  return { ok, message: ok ? data.message || `${name}测试通过` : data.error || data.message || `${name}测试未通过` };
}
export const testWanbangConnection = (key: string, secret: string) => testServiceConnection('万邦', {
  type: 'wanbang', wanbangKey: key.trim(), wanbangSecret: secret.trim(),
});
export const testScraperConnection = (id: string, secret: string) => testServiceConnection('APIA', {
  type: 'external_scraper', externalScraperId: id.trim(), externalScraperSecret: secret.trim(),
});
export const testQiyunConnection = (id: string, key: string) => testServiceConnection('奇云', {
  type: 'qiyun', qiyunAppId: id.trim(), qiyunAppKey: key.trim(),
});
