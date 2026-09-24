import { useEffect, useState } from 'react';
import { apiFetch } from '@/shared/api/apiClient';
import { credentialGet } from '@/shared/api/credentialClient';
import { persistLianchiConfig, persistOpenAIConfig } from '@/shared/api/persistCredentials';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { isPublicHttpGatewayIpUrl } from '@beike/domain/gatewayCreds';

export function useIndependentModelProviders(isOpen: boolean, showToast: (message: string) => void) {
  const [openAIBaseUrl, setOpenAIBaseUrl] = useState('https://api.openai.com');
  const [openAIApiKey, setOpenAIApiKey] = useState('');
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [openAIEnabled, setOpenAIEnabled] = useState(false);
  const [openAIInsecureHttpConsentUrl, setOpenAIInsecureHttpConsentUrl] = useState('');
  const normalizedOpenAIBaseUrl = openAIBaseUrl.trim().replace(/\/+$/, '');
  const openAIAllowInsecureHttp = /^http:\/\//i.test(normalizedOpenAIBaseUrl)
    && openAIInsecureHttpConsentUrl === normalizedOpenAIBaseUrl;
  const setOpenAIAllowInsecureHttp = (allowed: boolean) => {
    setOpenAIInsecureHttpConsentUrl(allowed ? normalizedOpenAIBaseUrl : '');
  };
  const switchOpenAIToHttpGateway = (baseUrl: string) => {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    if (!isPublicHttpGatewayIpUrl(normalized)) return;
    setOpenAIBaseUrl(normalized);
    setOpenAIInsecureHttpConsentUrl(normalized);
  };
  const [isTestingOpenAI, setIsTestingOpenAI] = useState(false);
  const [lianchiApiKey, setLianchiApiKey] = useState('');
  const [showLianchiKey, setShowLianchiKey] = useState(false);
  const [isTestingLianchi, setIsTestingLianchi] = useState(false);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    void credentialGet('openai_api_key').then(setOpenAIApiKey);
    void credentialGet('lianchi_api_key').then(setLianchiApiKey);
    setOpenAIBaseUrl(localStorage.getItem('openai_base_url') || 'https://api.openai.com');
    setOpenAIEnabled(localStorage.getItem('openai_responses_enabled') === 'true');
    setOpenAIInsecureHttpConsentUrl(localStorage.getItem('openai_insecure_http_consent_url') || '');
  }, [isOpen]);

  const handleTestOpenAI = async () => {
    if (!openAIApiKey.trim()) { showToast('请先填写 OpenAI API Key'); return; }
    setIsTestingOpenAI(true);
    const start = Date.now();
    try {
      const response = await apiFetch('/api/system/models/fetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', baseUrl: openAIBaseUrl.trim(), apiKey: openAIApiKey.trim(), allowInsecureHttp: openAIAllowInsecureHttp, isPing: true, strict: true }),
      });
      const data = await response.json().catch(() => ({}));
      showToast(response.ok && data.success
        ? `OpenAI 模型目录连通正常，${Date.now() - start}ms，返回 ${data.count} 款模型`
        : `OpenAI 模型目录请求失败 (${data.gatewayStatus || response.status})：${data.error || '请检查地址与密钥'}`);
    } catch (error) {
      showToast(`OpenAI 连接失败：${formatUserError(error, '网络错误')}`);
    } finally { setIsTestingOpenAI(false); }
  };

  const handleSaveOpenAIConfig = async () => {
    try {
      const url = new URL(openAIBaseUrl.trim());
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('接口地址须以 http 或 https 开头');
      if (url.protocol === 'http:' && !openAIAllowInsecureHttp) throw new Error('HTTP 网关需先勾选明文传输选项');
      if (url.protocol === 'http:' && !isPublicHttpGatewayIpUrl(url.toString())) throw new Error('HTTP 网关只支持公网 IPv4 地址，不支持内网地址或域名');
      if (openAIEnabled && !openAIApiKey.trim()) throw new Error('启用前请填写 OpenAI API Key');
      await persistOpenAIConfig(url.toString().replace(/\/+$/, ''), openAIApiKey);
      localStorage.setItem('openai_responses_enabled', String(openAIEnabled));
      localStorage.setItem('openai_channel_split_v1', 'true');
      if (openAIAllowInsecureHttp) localStorage.setItem('openai_insecure_http_consent_url', normalizedOpenAIBaseUrl);
      else localStorage.removeItem('openai_insecure_http_consent_url');
      showToast('OpenAI Responses 接口配置已保存');
    } catch (error) {
      showToast(`OpenAI 配置保存失败：${formatUserError(error, '请检查接口地址')}`);
    }
  };

  const handleSaveLianchiConfig = async () => {
    try {
      await persistLianchiConfig(lianchiApiKey);
      showToast('✅ 联池 API Key 已保存；选择「联池image2」即可调用');
    } catch (error) {
      showToast(`🔴 联池密钥保存失败：${formatUserError(error, '请重试')}`);
    }
  };

  const handleTestLianchi = async () => {
    if (!lianchiApiKey.trim()) { showToast('⚠️ 请先填写联池 API Key'); return; }
    setIsTestingLianchi(true);
    try {
      const response = await apiFetch('/api/system/models/fetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: 'https://api.gapnet.ai/endpoint', apiKey: lianchiApiKey.trim(), isPing: true, strict: true }),
      });
      const data = await response.json().catch(() => ({}));
      showToast(response.ok && data.success ? '🟢 联池模型接口连通正常' : `🔴 联池接口异常：${data.error || response.status}`);
    } catch (error) {
      showToast(`🔴 联池连接失败：${formatUserError(error, '网络错误')}`);
    } finally { setIsTestingLianchi(false); }
  };

  return {
    openAIBaseUrl, setOpenAIBaseUrl, openAIApiKey, setOpenAIApiKey,
    openAIAllowInsecureHttp, setOpenAIAllowInsecureHttp,
    switchOpenAIToHttpGateway,
    showOpenAIKey, setShowOpenAIKey, openAIEnabled, setOpenAIEnabled,
    isTestingOpenAI, handleTestOpenAI, handleSaveOpenAIConfig,
    lianchiApiKey, setLianchiApiKey, showLianchiKey, setShowLianchiKey,
    isTestingLianchi, handleTestLianchi, handleSaveLianchiConfig,
  };
}
