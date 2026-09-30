import { useCallback, useEffect, useState } from 'react';
import { credentialGet } from '@client/shared/api/credentialClient';
import { persistLianchiConfig, persistOpenAIConfig, waitForCredentialSaves } from '@client/shared/api/persistCredentials';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { useConnectionChecks } from './useConnectionChecks';
import { testModelConnection } from '../model/settingsConnectionChecks';
import { isPublicHttpGatewayIpUrl } from '@shared/domain/models/gatewayCreds';
import { useConfigSaveState } from './useConfigSaveState';

type ProviderSnapshot = {
  openAIBaseUrl: string; openAIApiKey: string; openAIEnabled: boolean;
  openAIAllowInsecureHttp: boolean; lianchiApiKey: string;
};

export function useIndependentModelProviders(isOpen: boolean, showToast: (message: string) => void, reloadVersion = 0) {
  const [independentConfigLoaded, setConfigLoaded] = useState(false);
  const [independentConfigLoadError, setConfigLoadError] = useState('');
  const [savedConfig, setSavedConfig] = useState<ProviderSnapshot | null>(null);
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
  }, showToast, isOpen && independentConfigLoaded);
  const isTestingOpenAI = Boolean(connectionChecks.testing.openai_official);
  const isTestingLianchi = Boolean(connectionChecks.testing.lianchi_images);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    let active = true;
    setConfigLoaded(false);
    setConfigLoadError('');
    void (async () => {
      await waitForCredentialSaves();
      const baseUrl = (localStorage.getItem('openai_base_url') || 'https://api.openai.com').trim().replace(/\/+$/, '');
      const enabled = localStorage.getItem('openai_responses_enabled') === 'true';
      const consentUrl = localStorage.getItem('openai_insecure_http_consent_url') || '';
      const [key, lianchiKey] = await Promise.all([credentialGet('openai_api_key', true), credentialGet('lianchi_api_key', true)]);
      if (!active) return;
      setOpenAIBaseUrl(baseUrl);
      setOpenAIEnabled(enabled);
      setOpenAIInsecureHttpConsentUrl(consentUrl);
      setOpenAIApiKey(key);
      setLianchiApiKey(lianchiKey);
      setSavedConfig({ openAIBaseUrl: baseUrl, openAIApiKey: key, openAIEnabled: enabled,
        openAIAllowInsecureHttp: /^http:\/\//i.test(baseUrl) && consentUrl === baseUrl, lianchiApiKey: lianchiKey });
      setConfigLoaded(true);
    })().catch(error => { if (active) setConfigLoadError(formatUserError(error, '独立渠道配置加载失败，请重试')); });
    return () => { active = false; };
  }, [isOpen, reloadVersion]);
  const onSaved = useCallback((snapshot: Partial<ProviderSnapshot>) => {
    setSavedConfig(previous => previous ? { ...previous, ...snapshot } : previous);
  }, []);
  const saves = useConfigSaveState<ProviderSnapshot>(isOpen && independentConfigLoaded, showToast, onSaved);

  const handleTestOpenAI = () => connectionChecks.run('openai_official', () => testModelConnection('Responses 接口', {
    provider: 'openai', baseUrl: openAIBaseUrl.trim(), apiKey: openAIApiKey.trim(), allowInsecureHttp: openAIAllowInsecureHttp,
  }));

  const handleSaveOpenAIConfig = async () => {
    try {
      const url = new URL(openAIBaseUrl.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('接口地址须为 HTTP 或 HTTPS Base URL，不包含账号、查询参数或片段');
      if (url.protocol === 'http:' && !openAIAllowInsecureHttp) throw new Error('HTTP 网关需先勾选明文传输选项');
      if (url.protocol === 'http:' && !isPublicHttpGatewayIpUrl(url.toString())) throw new Error('HTTP 网关只支持公网 IPv4 地址，不支持内网地址或域名');
      if (openAIEnabled && !openAIApiKey.trim()) throw new Error('启用前请填写 OpenAI API Key');
      const snapshot = { openAIBaseUrl: normalizedOpenAIBaseUrl, openAIApiKey: openAIApiKey.trim(), openAIEnabled, openAIAllowInsecureHttp };
      await saves.save('openai_official', snapshot, () => persistOpenAIConfig(snapshot.openAIBaseUrl, snapshot.openAIApiKey,
        { enabled: snapshot.openAIEnabled, allowInsecureHttp: snapshot.openAIAllowInsecureHttp }), 'OpenAI Responses 接口配置已保存');
    } catch (error) {
      showToast(`OpenAI 配置保存失败：${formatUserError(error, '请检查接口地址')}`);
    }
  };

  const handleSaveLianchiConfig = async () => {
    const snapshot = { lianchiApiKey: lianchiApiKey.trim() };
    await saves.save('lianchi_images', snapshot, () => persistLianchiConfig(snapshot.lianchiApiKey), '✅ 联池 API Key 已保存；选择「联池image2」即可调用');
  };

  const handleTestLianchi = () => connectionChecks.run('lianchi_images', () => testModelConnection('联池', {
    provider: 'lianchi', apiKey: lianchiApiKey.trim(),
  }));

  return {
    independentConfigLoaded, independentConfigLoadError,
    independentIsSavingConfig: saves.isSaving,
    isSavingOpenAI: saves.states.openai_official === 'saving',
    isSavingLianchi: saves.states.lianchi_images === 'saving',
    independentHasUnsavedChanges: Boolean(savedConfig && (
      normalizedOpenAIBaseUrl !== savedConfig.openAIBaseUrl || openAIApiKey.trim() !== savedConfig.openAIApiKey.trim() ||
      openAIEnabled !== savedConfig.openAIEnabled || openAIAllowInsecureHttp !== savedConfig.openAIAllowInsecureHttp ||
      lianchiApiKey.trim() !== savedConfig.lianchiApiKey.trim()
    )),
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
