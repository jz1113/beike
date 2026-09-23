import { apiFetch } from '@/shared/api/apiClient';
import { formatUserError } from '@beike/domain/upstreamErrors';

type Toast = (message: string) => void;

export async function testWanbangConnection(key: string, secret: string, showToast: Toast) {
  if (!key.trim() || !secret.trim()) { showToast('⚠️ 请先填写万邦 API Key 和 API Secret'); return; }
  try {
    const response = await apiFetch('/api/system/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'wanbang', wanbangKey: key.trim(), wanbangSecret: secret.trim() }),
    });
    const raw = await response.text();
    let data: { success?: boolean; message?: string; error?: string };
    try { data = raw.trim() ? JSON.parse(raw) : {}; }
    catch { showToast('🔴 万邦接口异常: 服务端返回空或非 JSON 响应，请确认应用服务正在运行后重试'); return; }
    showToast(response.ok && data.success
      ? `🟢 ${data.message || '万邦电商接口连通正常！'}`
      : `🔴 万邦接口异常: ${data.error || '无法连通万邦网关'}`);
  } catch (error) { showToast(`🔴 网络超时: ${formatUserError(error, '测试失败')}`); }
}

export async function testScraperConnection(id: string, secret: string, showToast: Toast) {
  if (!id.trim() || !secret.trim()) { showToast('⚠️ 请先填写 APIA Client ID 和 Secret Key'); return; }
  try {
    const response = await apiFetch('/api/system/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'external_scraper', externalScraperId: id.trim(), externalScraperSecret: secret.trim() }),
    });
    const data = await response.json();
    showToast(response.ok && data.success
      ? data.parseOk ? `🟢 ${data.message || 'APIA 小红书解析测试通过！'}` : `🟡 ${data.message || 'APIA 密钥有效，但测试笔记未能解析'}`
      : `🔴 APIA 接口异常: ${data.error || '无法连通 APIA 网关'}`);
  } catch (error) { showToast(`🔴 网络超时: ${formatUserError(error, '测试失败')}`); }
}

export async function testQiyunConnection(id: string, key: string, showToast: Toast) {
  if (!id.trim() || !key.trim()) { showToast('⚠️ 请先填写奇云 App ID 和 App Key'); return; }
  try {
    const response = await apiFetch('/api/system/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'qiyun', qiyunAppId: id.trim(), qiyunAppKey: key.trim() }),
    });
    const data = await response.json();
    showToast(response.ok && data.success
      ? `🟢 ${data.message || '奇云解析接口测试通过！'}`
      : `🔴 奇云接口异常: ${data.error || '无法连通奇云网关'}`);
  } catch (error) { showToast(`🔴 网络超时: ${formatUserError(error, '测试失败')}`); }
}
