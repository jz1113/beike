import { writeLocalConfig } from '@client/shared/api/localConfigStorage';
import { clearCredentialMemoryCache } from '@client/shared/api/credentialClient';
import { setClientGatewayApiKey, setClientGatewayBaseUrl } from '@client/shared/api/gatewayClient';
import { isPublicHttpGatewayIpUrl } from '@shared/domain/models/gatewayCreds';
import { API_PROVIDERS_STORAGE_KEY, loadStoredProviders, type ApiProvider } from './apiProviderTypes';
import {
  canonicalProviderId, loadSavedProviderCredentialSnapshots, notifyProviderCommit,
  providerCredentialChanges, SAVED_PROVIDER_CREDENTIALS_KEY, type ProviderCredentials,
} from './providerCredentialSync';

export interface ProviderCommitOptions {
  openAI?: { enabled: boolean; allowInsecureHttp: boolean };
}

/** Commit the provider, inherited snapshots and legacy runtime keys as one local group. */
export function commitProviderConfig(draft: ApiProvider, previous: ProviderCredentials, options: ProviderCommitOptions = {}): { provider: ApiProvider; updated: number } {
  const provider = { ...draft, baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey.trim() };
  if (provider.baseUrl) {
    let url: URL;
    try { url = new URL(provider.baseUrl); } catch { throw new Error('请填写完整的 HTTP 或 HTTPS 接口地址'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('接口地址须为 HTTP 或 HTTPS Base URL，不包含账号、查询参数或片段');
    }
  }
  const stored = loadStoredProviders();
  if (!stored.some(item => item.id === provider.id)) throw new Error('该服务商已移除，请重新打开设置');
  const { values, updated } = providerCredentialChanges(provider.id, previous, provider);
  values[API_PROVIDERS_STORAGE_KEY] = JSON.stringify(stored.map(item => item.id === provider.id ? provider : item));
  values[SAVED_PROVIDER_CREDENTIALS_KEY] = JSON.stringify({ ...loadSavedProviderCredentialSnapshots(),
    [provider.id]: { baseUrl: provider.baseUrl, apiKey: provider.apiKey } });
  const id = canonicalProviderId(provider.id);
  if (id === 'comfly_gateway') {
    if (!provider.baseUrl) throw new Error('请填写完整的 HTTP 或 HTTPS 接口地址');
    values.ai_base_url = provider.baseUrl;
    values.ai_api_key = provider.apiKey || null;
  } else if (id === 'openai_official') {
    values.openai_base_url = provider.baseUrl || 'https://api.openai.com';
    values.openai_api_key = provider.apiKey || null;
    const enabled = options.openAI?.enabled ?? localStorage.getItem('openai_responses_enabled') === 'true';
    const allowHTTP = options.openAI?.allowInsecureHttp ?? localStorage.getItem('openai_insecure_http_consent_url') === provider.baseUrl;
    if (enabled && !provider.apiKey) throw new Error('启用前请填写 OpenAI API Key');
    if (/^http:\/\//i.test(provider.baseUrl)) {
      if (!allowHTTP) throw new Error('HTTP 网关需先勾选明文传输选项');
      if (!isPublicHttpGatewayIpUrl(provider.baseUrl)) throw new Error('HTTP 网关只支持公网 IPv4 地址，不支持内网地址或域名');
    }
    values.openai_responses_enabled = String(enabled);
    values.openai_channel_split_v1 = 'true';
    values.openai_insecure_http_consent_url = allowHTTP && /^http:\/\//i.test(provider.baseUrl) ? provider.baseUrl.replace(/\/+$/, '') : null;
  } else if (id === 'deepseek_official') values.deepseek_api_key = provider.apiKey || null;
  else if (id === 'lianchi_images') values.lianchi_api_key = provider.apiKey || null;
  writeLocalConfig(values);
  // Publish only after every persistent write succeeds. No await between persistence and publication.
  clearCredentialMemoryCache();
  if (id === 'comfly_gateway') {
    setClientGatewayBaseUrl(provider.baseUrl);
    setClientGatewayApiKey(provider.apiKey);
  }
  notifyProviderCommit(provider.id);
  return { provider, updated };
}
