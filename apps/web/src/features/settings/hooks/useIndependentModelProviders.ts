import { useEffect, useState } from 'react';
import { credentialGet } from '@/shared/api/credentialClient';
import { persistLianchiConfig, persistOpenAIConfig } from '@/shared/api/persistCredentials';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { useConnectionChecks } from './useConnectionChecks';
import { testModelConnection } from '../settingsConnectionChecks';
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
  const [lianchiApiKey, setLianchiApiKey] = useState('');
  const [showLianchiKey, setShowLianchiKey] = useState(false);
  const connectionChecks = useConnectionChecks({
    openai_official: [openAIBaseUrl.trim(), openAIApiKey.trim(), openAIAllowInsecureHttp, openAIEnabled],
    lianchi_images: [lianchiApiKey.trim()],
  }, showToast);
  const isTestingOpenAI = Boolean(connectionChecks.testing.openai_official);
  const isTestingLianchi = Boolean(connectionChecks.testing.lianchi_images);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    void credentialGet('openai_api_key').then(setOpenAIApiKey);
    void credentialGet('lianchi_api_key').then(setLianchiApiKey);
    setOpenAIBaseUrl(localStorage.getItem('openai_base_url') || 'https://api.openai.com');
    setOpenAIEnabled(localStorage.getItem('openai_responses_enabled') === 'true');
    setOpenAIInsecureHttpConsentUrl(localStorage.getItem('openai_insecure_http_consent_url') || '');
  }, [isOpen]);

  const handleTestOpenAI = () => connectionChecks.run('openai_official', () => testModelConnection('Responses 接口', {
    provider: 'openai', baseUrl: openAIBaseUrl.trim(), apiKey: openAIApiKey.trim(), allowInsecureHttp: openAIAllowInsecureHttp,
  }));

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

  const handleTestLianchi = () => connectionChecks.run('lianchi_images', () => testModelConnection('联池', {
    provider: 'lianchi', apiKey: lianchiApiKey.trim(),
  }));

  return {
    connectionResults: connectionChecks.results,
    openAIBaseUrl, setOpenAIBaseUrl, openAIApiKey, setOpenAIApiKey,
    openAIAllowInsecureHttp, setOpenAIAllowInsecureHttp,
    switchOpenAIToHttpGateway,
    showOpenAIKey, setShowOpenAIKey, openAIEnabled, setOpenAIEnabled,
    isTestingOpenAI, handleTestOpenAI, handleSaveOpenAIConfig,
    lianchiApiKey, setLianchiApiKey, showLianchiKey, setShowLianchiKey,
    isTestingLianchi, handleTestLianchi, handleSaveLianchiConfig,
  };
}
