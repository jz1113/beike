import { useCallback, useEffect, useState } from 'react';
import { credentialGet } from '@client/shared/api/credentialClient';
import { persistOpenAIConfig, waitForCredentialSaves } from '@client/shared/api/persistCredentials';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { useConnectionChecks, useConfigSaveState } from './useApiProviders';
import { testModelConnection } from '../model/apiProviderTypes';
import { isPublicHttpGatewayIpUrl } from '@shared/domain/models/gatewayCreds';

type ProviderSnapshot = {
  openAIBaseUrl: string;
  openAIApiKey: string;
  openAIEnabled: boolean;
  openAIInsecureHttpConsentUrl: string;
};

function buildIndependentProviderSnapshot(
  openAIBaseUrl: string,
  openAIApiKey: string,
  openAIEnabled: boolean,
  openAIInsecureHttpConsentUrl: string,
): ProviderSnapshot {
  return {
    openAIBaseUrl: openAIBaseUrl.trim().replace(/\/+$/, ''),
    openAIApiKey: openAIApiKey.trim(),
    openAIEnabled,
    openAIInsecureHttpConsentUrl: openAIInsecureHttpConsentUrl.trim(),
  };
}

function independentProviderFingerprint(snapshot: ProviderSnapshot): string {
  return JSON.stringify(snapshot);
}

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
  const connectionChecks = useConnectionChecks({
    openai_official: [openAIBaseUrl.trim(), openAIApiKey.trim(), openAIAllowInsecureHttp, openAIEnabled],
  }, showToast, isOpen && independentConfigLoaded);
  const isTestingOpenAI = Boolean(connectionChecks.testing.openai_official);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    let active = true;
    setConfigLoaded(false);
    setConfigLoadError('');
    setSavedConfig(null);
    void (async () => {
      await waitForCredentialSaves();
      const baseUrl = (localStorage.getItem('openai_base_url') || 'https://api.openai.com').trim().replace(/\/+$/, '');
      const enabled = localStorage.getItem('openai_responses_enabled') === 'true';
      const consentUrl = (localStorage.getItem('openai_insecure_http_consent_url') || '').trim();
      const key = await credentialGet('openai_api_key', true);
      if (!active) return;
      setOpenAIBaseUrl(baseUrl);
      setOpenAIEnabled(enabled);
      setOpenAIInsecureHttpConsentUrl(consentUrl);
      setOpenAIApiKey(key);
      setSavedConfig(buildIndependentProviderSnapshot(baseUrl, key, enabled, consentUrl));
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

  const handleSaveOpenAIConfig = async (
    notify = true,
    overrides?: { baseUrl?: string; apiKey?: string },
  ) => {
    try {
      const effectiveBaseUrl = overrides?.baseUrl ?? openAIBaseUrl;
      const effectiveApiKey = overrides?.apiKey ?? openAIApiKey;
      const url = new URL(effectiveBaseUrl.trim());
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('接口地址须为 HTTP 或 HTTPS Base URL，不包含账号、查询参数或片段');
      if (url.protocol === 'http:' && !openAIAllowInsecureHttp) throw new Error('HTTP 网关需先勾选明文传输选项');
      if (url.protocol === 'http:' && !isPublicHttpGatewayIpUrl(url.toString())) throw new Error('HTTP 网关只支持公网 IPv4 地址，不支持内网地址或域名');
      if (openAIEnabled && !effectiveApiKey.trim()) throw new Error('启用前请填写 OpenAI API Key');
      const snapshot = buildIndependentProviderSnapshot(
        effectiveBaseUrl,
        effectiveApiKey,
        openAIEnabled,
        openAIAllowInsecureHttp ? normalizedOpenAIBaseUrl : '',
      );
      const saved = await saves.save('openai_official', snapshot, () => persistOpenAIConfig(snapshot.openAIBaseUrl, snapshot.openAIApiKey,
        {
          enabled: snapshot.openAIEnabled,
          allowInsecureHttp: /^http:\/\//i.test(snapshot.openAIBaseUrl)
            && snapshot.openAIInsecureHttpConsentUrl === snapshot.openAIBaseUrl,
        }), 'OpenAI Responses 接口配置已保存', notify);
      if (saved) {
        setOpenAIBaseUrl(snapshot.openAIBaseUrl);
        setOpenAIApiKey(snapshot.openAIApiKey);
      }
      return saved;
    } catch (error) {
      showToast(`OpenAI 配置保存失败：${formatUserError(error, '请检查接口地址')}`);
      return false;
    }
  };

  return {
    independentConfigLoaded, independentConfigLoadError,
    independentIsSavingConfig: saves.isSaving,
    isSavingOpenAI: saves.states.openai_official === 'saving',
    independentHasUnsavedChanges: Boolean(independentConfigLoaded && savedConfig && (
      independentProviderFingerprint(buildIndependentProviderSnapshot(
        openAIBaseUrl,
        openAIApiKey,
        openAIEnabled,
        openAIInsecureHttpConsentUrl,
      )) !== independentProviderFingerprint(savedConfig)
    )),
    connectionResults: connectionChecks.results,
    openAIBaseUrl, setOpenAIBaseUrl, openAIApiKey, setOpenAIApiKey,
    openAIAllowInsecureHttp, setOpenAIAllowInsecureHttp,
    switchOpenAIToHttpGateway,
    showOpenAIKey, setShowOpenAIKey, openAIEnabled, setOpenAIEnabled,
    isTestingOpenAI, handleTestOpenAI, handleSaveOpenAIConfig,
  };
}
