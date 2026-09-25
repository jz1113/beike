import { apiFetch } from '@/shared/api/apiClient';
import {storageProviderError} from '../storageValidation';
import { useState, useEffect, useRef } from 'react';
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
import { useConnectionChecks } from './useConnectionChecks';
import { testModelConnection, testScraperConnection, testQiyunConnection, testWanbangConnection } from '../settingsConnectionChecks';

interface UseSettingsConfigOptions {
  isOpen: boolean;
  showToast: (msg: string) => void;
}

export function useSettingsConfig({ isOpen, showToast }: UseSettingsConfigOptions) {
  // Comfly API Gateway
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://ai.comfly.org');
  const [showKey, setShowKey] = useState(false);
  const [deepSeekApiKey, setDeepSeekApiKey] = useState('');
  const [showDeepSeekKey, setShowDeepSeekKey] = useState(false);
  const independentProviders = useIndependentModelProviders(isOpen, showToast);

  // 万邦 (OneBound)
  const [wanbangKey, setWanbangKey] = useState('');
  const [wanbangSecret, setWanbangSecret] = useState('');
  const [isWanbangEnabled, setIsWanbangEnabled] = useState(true);

  // 社媒解析 (APIA)
  const [scraperId, setScraperId] = useState('');
  const [scraperSecret, setScraperSecret] = useState('');
  const [isApiaEnabled, setIsApiaEnabled] = useState(true);
  const [appAccessToken, setAppAccessToken] = useState('');

  // 奇云多平台去水印解析
  const [qiyunAppId, setQiyunAppId] = useState('');
  const [qiyunAppKey, setQiyunAppKey] = useState('');
  const [isQiyunEnabled, setIsQiyunEnabled] = useState(true);

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
        setBaseUrl(savedUrl);
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
  const connectionChecks = useConnectionChecks({
    cloud_storage: [storageEnabled, storageProvider, storageAccountId, storageEndpoint, storageAccessKeyId, storageSecretAccessKey, storageBucketName, storagePublicDomain],
    comfly_gateway: [baseUrl.trim(), apiKey.trim()],
    deepseek_official: [deepSeekApiKey.trim()],
    wanbang_ecommerce: [wanbangKey.trim(), wanbangSecret.trim(), isWanbangEnabled],
    apia_parser: [scraperId.trim(), scraperSecret.trim(), isApiaEnabled],
    qiyun_parser: [qiyunAppId.trim(), qiyunAppKey.trim(), isQiyunEnabled],
  }, showToast);
  const isTestingStorage = Boolean(connectionChecks.testing.cloud_storage);
  const handleTestStorage = () => connectionChecks.run('cloud_storage', async () => {
    const error = storageProviderError(storageProvider, storageEndpoint);
    if (error) return { ok: false, message: error };
    const response = await apiFetch('/api/assets/storage/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { enabled: storageEnabled, provider: storageProvider, accountId: storageAccountId, endpoint: storageEndpoint, accessKeyId: storageAccessKeyId, secretAccessKey: storageSecretAccessKey, bucketName: storageBucketName, publicDomain: storagePublicDomain } }),
    });
    const data = await response.json();
    const ok = Boolean(response.ok && data.success);
    return { ok, message: ok ? '存储桶连接成功' : `存储桶连接失败：${data.message || data.error || response.status}` };
  });
  const isTesting = Boolean(connectionChecks.testing.comfly_gateway);
  const isTestingDeepSeek = Boolean(connectionChecks.testing.deepseek_official);
  const isTestingWanbang = Boolean(connectionChecks.testing.wanbang_ecommerce);
  const isTestingScraper = Boolean(connectionChecks.testing.apia_parser);
  const isTestingQiyun = Boolean(connectionChecks.testing.qiyun_parser);
  const handleTestPing = () => connectionChecks.run('comfly_gateway', () => testModelConnection('Comfly', { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() }));
  const handleTestDeepSeek = () => connectionChecks.run('deepseek_official', () => testModelConnection('DeepSeek', {
    baseUrl: 'https://api.deepseek.com', apiKey: deepSeekApiKey.trim(),
  }));

  const handleSaveDeepSeekConfig = async () => {
    try {
      await persistDeepSeekConfig(deepSeekApiKey);
      showToast('DeepSeek 独立凭证已保存；Comfly 配置保持不变');
    } catch (error) { showToast(formatUserError(error, 'DeepSeek 凭证保存失败')); }
  };

  const handleTestWanbang = () => connectionChecks.run('wanbang_ecommerce', () => testWanbangConnection(wanbangKey, wanbangSecret));

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

  const handleTestScraper = () => connectionChecks.run('apia_parser', () => testScraperConnection(scraperId, scraperSecret));

  const handleSaveQiyunConfig = () => {
    void persistQiyunConfig(qiyunAppId, qiyunAppKey);
    localStorage.setItem('qiyun_enabled', isQiyunEnabled ? 'true' : 'false');
    showToast('✅ 奇云 30+ 平台去水印解析接口配置已保存');
  };

  const handleTestQiyun = () => connectionChecks.run('qiyun_parser', () => testQiyunConnection(qiyunAppId, qiyunAppKey));

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
    isTesting,
    deepSeekApiKey,
    setDeepSeekApiKey,
    showDeepSeekKey,
    setShowDeepSeekKey,
    isTestingDeepSeek,
    handleTestDeepSeek,
    handleSaveDeepSeekConfig,
    ...independentProviders,
    connectionResults: { ...connectionChecks.results, ...independentProviders.connectionResults },
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
    handleTestStorage,
    isMigratingStorage,
    setIsMigratingStorage,
    handleSaveStorageConfig,
  };
}
