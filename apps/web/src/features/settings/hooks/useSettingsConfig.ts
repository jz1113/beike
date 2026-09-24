import {storageProviderError} from '../storageValidation';
import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/shared/api/apiClient';
import {
  persistAiGatewayConfig,
  persistDeepSeekConfig,
  persistExternalScraperConfig,
  persistQiyunConfig,
  persistStorageConfig,
  persistWanbangConfig,
} from '@/shared/api/persistCredentials';
import { setClientGatewayApiKey, setClientGatewayBaseUrl } from '@/shared/api/gatewayClient';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { credentialGet } from '@/shared/api/credentialClient';
import { useIndependentModelProviders } from './useIndependentModelProviders';
import { testScraperConnection, testQiyunConnection, testWanbangConnection } from '../settingsConnectionChecks';

interface UseSettingsConfigOptions {
  isOpen: boolean;
  showToast: (msg: string) => void;
}

export function useSettingsConfig({ isOpen, showToast }: UseSettingsConfigOptions) {
  // Comfly API Gateway
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://ai.comfly.org');
  const [showKey, setShowKey] = useState(false);
  const [isGatewayEnabled, setIsGatewayEnabled] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [deepSeekApiKey, setDeepSeekApiKey] = useState('');
  const [showDeepSeekKey, setShowDeepSeekKey] = useState(false);
  const [isTestingDeepSeek, setIsTestingDeepSeek] = useState(false);
  const independentProviders = useIndependentModelProviders(isOpen, showToast);

  // 万邦 (OneBound)
  const [wanbangKey, setWanbangKey] = useState('');
  const [wanbangSecret, setWanbangSecret] = useState('');
  const [isWanbangEnabled, setIsWanbangEnabled] = useState(true);
  const [isTestingWanbang, setIsTestingWanbang] = useState(false);

  // 社媒解析 (APIA)
  const [scraperId, setScraperId] = useState('');
  const [scraperSecret, setScraperSecret] = useState('');
  const [isApiaEnabled, setIsApiaEnabled] = useState(true);
  const [isTestingScraper, setIsTestingScraper] = useState(false);
  const [appAccessToken, setAppAccessToken] = useState('');

  // 奇云多平台去水印解析
  const [qiyunAppId, setQiyunAppId] = useState('');
  const [qiyunAppKey, setQiyunAppKey] = useState('');
  const [isQiyunEnabled, setIsQiyunEnabled] = useState(true);
  const [isTestingQiyun, setIsTestingQiyun] = useState(false);

  // 云端永久对象存储
  const [storageEnabled, setStorageEnabled] = useState(false);
  const [storageProvider, setStorageProvider] = useState<
    'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase'
  >('oss');
  const [storageAccountId, setStorageAccountId] = useState('');
  const [storageEndpoint, setStorageEndpoint] = useState('');
  const [storageAccessKeyId, setStorageAccessKeyId] = useState('');
  const [storageSecretAccessKey, setStorageSecretAccessKey] = useState('');
  const [showStorageSecret, setShowStorageSecret] = useState(false);
  const [storageBucketName, setStorageBucketName] = useState('');
  const [storagePublicDomain, setStoragePublicDomain] = useState('');
  const [isTestingStorage, setIsTestingStorage] = useState(false);
  const [isMigratingStorage, setIsMigratingStorage] = useState(false);

  const storageDrafts=useRef<Record<string,{endpoint:string;accountId:string;key:string;secret:string;bucket:string;domain:string}>>({});
  const changeStorageProvider=(next:typeof storageProvider)=>{
    if(next===storageProvider)return;
    storageDrafts.current[storageProvider]={endpoint:storageEndpoint,accountId:storageAccountId,key:storageAccessKeyId,secret:storageSecretAccessKey,bucket:storageBucketName,domain:storagePublicDomain};
    const draft=storageDrafts.current[next];
    setStorageProvider(next);
    setStorageEndpoint(draft?.endpoint || '');setStorageAccountId(draft?.accountId || '');
    setStorageAccessKeyId(draft?.key || '');setStorageSecretAccessKey(draft?.secret || '');
    setStorageBucketName(draft?.bucket || '');setStoragePublicDomain(draft?.domain || '');setShowStorageSecret(false);
  };

  // 初始化加载配置
  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      void (async () => {
        const savedUrl = localStorage.getItem('ai_base_url') || 'https://ai.comfly.org';
        const savedApiKey = await credentialGet('ai_api_key');
        const finalKey = savedApiKey || localStorage.getItem('ai_api_key') || '';
        setApiKey(finalKey);
        setClientGatewayApiKey(finalKey);
        setClientGatewayBaseUrl(savedUrl);

        const savedDeepSeekKey = await credentialGet('deepseek_api_key');
        setDeepSeekApiKey(savedDeepSeekKey || localStorage.getItem('deepseek_api_key') || '');


        const savedWbKey = await credentialGet('wanbang_api_key');
        const savedWbSec = await credentialGet('wanbang_api_secret');
        setWanbangKey(savedWbKey || localStorage.getItem('wanbang_api_key') || '');
        setWanbangSecret(savedWbSec || localStorage.getItem('wanbang_api_secret') || '');

        const savedScraperId = await credentialGet('external_scraper_id');
        const savedScraperSec = await credentialGet('external_scraper_secret');
        setScraperId(savedScraperId || localStorage.getItem('external_scraper_id') || '');
        setScraperSecret(savedScraperSec || localStorage.getItem('external_scraper_secret') || '');

        const savedQiyunId = await credentialGet('qiyun_app_id');
        const savedQiyunKey = await credentialGet('qiyun_app_key');
        setQiyunAppId(savedQiyunId || localStorage.getItem('qiyun_app_id') || '');
        setQiyunAppKey(savedQiyunKey || localStorage.getItem('qiyun_app_key') || '');
        setIsQiyunEnabled(localStorage.getItem('qiyun_enabled') !== 'false');

        const savedAppToken = localStorage.getItem('app_access_token') || '';
        setAppAccessToken(savedAppToken || 'azhuo-local-dev');

        const savedStorageEnabled = localStorage.getItem('storage_enabled') === 'true';
        const rawStorageProvider = localStorage.getItem('storage_provider');
        const savedStorageProvider = rawStorageProvider === 'cos' ? 'cos' : 'oss';
        const savedStorageAccId = localStorage.getItem('storage_account_id') || '';
        const savedStorageEndpoint = localStorage.getItem('storage_endpoint') || '';
        const savedStorageKeyId = localStorage.getItem('storage_access_key_id') || '';
        const savedStorageSecret = await credentialGet('storage_secret_access_key');
        const savedStorageBucket = localStorage.getItem('storage_bucket_name') || '';
        const savedStorageDomain = localStorage.getItem('storage_public_domain') || '';

        setStorageEnabled(savedStorageEnabled);
        setStorageProvider(savedStorageProvider);
        setStorageAccountId(savedStorageAccId);
        setStorageEndpoint(savedStorageEndpoint);
        setStorageAccessKeyId(savedStorageKeyId);
        setStorageSecretAccessKey(
          savedStorageSecret || localStorage.getItem('storage_secret_access_key') || ''
        );
        setStorageBucketName(savedStorageBucket);
        setStoragePublicDomain(savedStorageDomain);
      })();
    }
  }, [isOpen]);

  // 测试 Comfly 网关延迟 Ping
  const handleTestPing = async () => {
    if (!apiKey.trim()) {
      showToast('⚠️ 请先填写 API Key');
      return;
    }
    setIsTesting(true);
    const start = Date.now();
    try {
      const res = await apiFetch('/api/system/models/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          isPing: true,
        }),
      });
      const latency = Date.now() - start;
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && !data.isFallback) {
        showToast(`🟢 连通正常！响应延迟: ${latency}ms (检测到 ${data.count || 0} 款可用模型)`);
      } else if (data.isFallback && data.warning) {
        showToast(`⚠️ 网关响应异常 (${data.gatewayStatus || res.status}): ${data.warning}`);
      } else {
        showToast(
          `🔴 连接异常 (${data.gatewayStatus || res.status}): ${data.error || '无法访问 API 网关'}`
        );
      }
    } catch (e: any) {
      showToast(`🔴 网络超时: ${formatUserError(e, '网关连接失败')}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestDeepSeek = async () => {
    if (!deepSeekApiKey.trim()) {
      showToast('⚠️ 请先填写 DeepSeek API Key');
      return;
    }
    setIsTestingDeepSeek(true);
    const start = Date.now();
    try {
      const res = await apiFetch('/api/system/models/fetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: 'https://api.deepseek.com', apiKey: deepSeekApiKey.trim(), isPing: true, strict: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast(`🟢 DeepSeek 官方接口连通正常！响应延迟: ${Date.now() - start}ms`);
      } else {
        showToast(`🔴 DeepSeek 接口异常 (${data.gatewayStatus || res.status}): ${data.error || '无法访问官方接口'}`);
      }
    } catch (e: unknown) {
      showToast(`🔴 网络超时: ${formatUserError(e, 'DeepSeek 连接失败')}`);
    } finally {
      setIsTestingDeepSeek(false);
    }
  };

  const handleSaveDeepSeekConfig = async (activate = false) => {
    try {
      await persistDeepSeekConfig(deepSeekApiKey);
      if (activate) {
        await handleSaveApiConfig('https://api.deepseek.com', deepSeekApiKey, false);
        setBaseUrl('https://api.deepseek.com');
        setApiKey(deepSeekApiKey.trim());
        showToast('✅ 已启用 DeepSeek 官方接口；请在默认业务模型中选择 DeepSeek 模型');
      } else {
        showToast('✅ DeepSeek 官方 API Key 已安全保存');
      }
    } catch (err) {
      console.warn('[handleSaveDeepSeekConfig] 保存失败:', err);
      showToast('⚠️ DeepSeek API Key 保存异常，请稍后重试');
    }
  };

  const handleTestWanbang = async () => {
    setIsTestingWanbang(true);
    try { await testWanbangConnection(wanbangKey, wanbangSecret, showToast); }
    finally { setIsTestingWanbang(false); }
  };

  // 自动保存 API 配置
  const handleSaveApiConfig = async (newUrl: string, newKey: string, notify = false) => {
    const cleanUrl = newUrl.trim();
    const cleanKey = newKey.trim();
    setClientGatewayBaseUrl(cleanUrl);
    setClientGatewayApiKey(cleanKey);

    try {
      await persistAiGatewayConfig(cleanUrl, cleanKey);
      if (notify) {
        if (!cleanKey) {
          showToast('⚠️ 已清空 API Key，如需调用大模型请填入有效密钥');
        } else {
          showToast('✅ Comfly 网关与 API Key 已成功保存生效！');
        }
      }
    } catch (err: unknown) {
      console.warn('[handleSaveApiConfig] 凭证存储告警:', err);
      if (notify) {
        showToast('⚠️ 本次会话已生效，但持久化存储失败，请重试');
      }
    }
  };

  const handleSaveWanbangConfig = async () => {
    try {
      await persistWanbangConfig(wanbangKey, wanbangSecret);
      showToast('✅ 万邦电商采集接口配置已保存');
    } catch (err) {
      console.warn('[handleSaveWanbangConfig] 保存失败:', err);
      showToast('⚠️ 万邦采集配置保存异常，请稍后重试');
    }
  };

  const handleSaveScraperConfig = async () => {
    try {
      await persistExternalScraperConfig(scraperId, scraperSecret);
      showToast('✅ 社媒解析接口配置已保存');
    } catch (err) {
      console.warn('[handleSaveScraperConfig] 保存失败:', err);
      showToast('⚠️ 社媒解析配置保存异常，请稍后重试');
    }
  };

  const handleTestScraper = async () => {
    setIsTestingScraper(true);
    try { await testScraperConnection(scraperId, scraperSecret, showToast); }
    finally { setIsTestingScraper(false); }
  };

  const handleSaveQiyunConfig = () => {
    void persistQiyunConfig(qiyunAppId, qiyunAppKey);
    localStorage.setItem('qiyun_enabled', isQiyunEnabled ? 'true' : 'false');
    showToast('✅ 奇云 30+ 平台去水印解析接口配置已保存');
  };

  const handleTestQiyun = async () => {
    setIsTestingQiyun(true);
    try { await testQiyunConnection(qiyunAppId, qiyunAppKey, showToast); }
    finally { setIsTestingQiyun(false); }
  };

  const handleSaveStorageConfig = async () => {
    const error=storageEnabled ? storageProviderError(storageProvider,storageEndpoint) : '';
    if(error){showToast(error);return;}
    try {
    await persistStorageConfig({
      enabled: storageEnabled,
      provider: storageProvider,
      accountId: storageAccountId,
      endpoint: storageEndpoint,
      accessKeyId: storageAccessKeyId,
      secretAccessKey: storageSecretAccessKey,
      bucketName: storageBucketName,
      publicDomain: storagePublicDomain,
    });
    showToast('✅ 对象存储配置已保存生效');
    } catch(error){showToast(formatUserError(error,'存储配置保存失败'));}
  };

  return {
    apiKey,
    setApiKey,
    baseUrl,
    setBaseUrl,
    showKey,
    setShowKey,
    isGatewayEnabled,
    setIsGatewayEnabled,
    isTesting,
    deepSeekApiKey,
    setDeepSeekApiKey,
    showDeepSeekKey,
    setShowDeepSeekKey,
    isTestingDeepSeek,
    handleTestDeepSeek,
    handleSaveDeepSeekConfig,
    ...independentProviders,
    appAccessToken,
    setAppAccessToken,
    handleSaveApiConfig,
    handleTestPing,
    wanbangKey,
    setWanbangKey,
    wanbangSecret,
    setWanbangSecret,
    isWanbangEnabled,
    setIsWanbangEnabled,
    isTestingWanbang,
    handleSaveWanbangConfig,
    handleTestWanbang,
    scraperId,
    setScraperId,
    scraperSecret,
    setScraperSecret,
    isApiaEnabled,
    setIsApiaEnabled,
    isTestingScraper,
    handleSaveScraperConfig,
    handleTestScraper,
    qiyunAppId,
    setQiyunAppId,
    qiyunAppKey,
    setQiyunAppKey,
    isQiyunEnabled,
    setIsQiyunEnabled,
    isTestingQiyun,
    handleSaveQiyunConfig,
    handleTestQiyun,
    storageEnabled,
    setStorageEnabled,
    storageProvider,
    setStorageProvider:changeStorageProvider,
    storageAccountId,
    setStorageAccountId,
    storageEndpoint,
    setStorageEndpoint,
    storageAccessKeyId,
    setStorageAccessKeyId,
    storageSecretAccessKey,
    setStorageSecretAccessKey,
    showStorageSecret,
    setShowStorageSecret,
    storageBucketName,
    setStorageBucketName,
    storagePublicDomain,
    setStoragePublicDomain,
    isTestingStorage,
    setIsTestingStorage,
    isMigratingStorage,
    setIsMigratingStorage,
    handleSaveStorageConfig,
  };
}
