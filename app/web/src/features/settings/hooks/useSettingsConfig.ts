import {storageProviderError} from '../storageValidation';
import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiClient';
import {
  persistAiGatewayConfig,
  persistExternalScraperConfig,
  persistQiyunConfig,
  persistStorageConfig,
  persistWanbangConfig,
} from '@/lib/persistDesktopSecrets';
import { setClientGatewayApiKey, setClientGatewayBaseUrl } from '@/lib/gatewayClient';
import { formatUserError } from '@beike/shared/upstreamErrors';
import { credentialGet } from '@/lib/credentialClient';
import { isTauriDesktop } from '@/lib/desktopRuntime';

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
        if (isTauriDesktop() && savedApiKey && localStorage.getItem('ai_api_key')) {
          localStorage.removeItem('ai_api_key');
        }
        setApiKey(finalKey);
        setClientGatewayApiKey(finalKey);
        setClientGatewayBaseUrl(savedUrl);

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

  // 测试万邦电商数据采集接口连通性
  const handleTestWanbang = async () => {
    if (!wanbangKey.trim() || !wanbangSecret.trim()) {
      showToast('⚠️ 请先填写万邦 API Key 和 API Secret');
      return;
    }
    setIsTestingWanbang(true);
    try {
      const res = await apiFetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'wanbang',
          wanbangKey: wanbangKey.trim() || undefined,
          wanbangSecret: wanbangSecret.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🟢 ${data.message || '万邦电商接口连通正常！'}`);
      } else {
        showToast(`🔴 万邦接口异常: ${data.error || '无法连通万邦网关'}`);
      }
    } catch (err: any) {
      showToast(`🔴 网络超时: ${formatUserError(err, '测试失败')}`);
    } finally {
      setIsTestingWanbang(false);
    }
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
    if (!scraperId.trim() || !scraperSecret.trim()) {
      showToast('⚠️ 请先填写 APIA Client ID 和 Secret Key');
      return;
    }
    setIsTestingScraper(true);
    try {
      const res = await apiFetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'external_scraper',
          externalScraperId: scraperId.trim(),
          externalScraperSecret: scraperSecret.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.parseOk) {
          showToast(`🟢 ${data.message || 'APIA 小红书解析测试通过！'}`);
        } else {
          showToast(`🟡 ${data.message || 'APIA 密钥有效，但测试笔记未能解析'}`);
        }
      } else {
        showToast(`🔴 APIA 接口异常: ${data.error || '无法连通 APIA 网关'}`);
      }
    } catch (err: unknown) {
      showToast(`🔴 网络超时: ${formatUserError(err, '测试失败')}`);
    } finally {
      setIsTestingScraper(false);
    }
  };

  const handleSaveQiyunConfig = () => {
    void persistQiyunConfig(qiyunAppId, qiyunAppKey);
    localStorage.setItem('qiyun_enabled', isQiyunEnabled ? 'true' : 'false');
    showToast('✅ 奇云 30+ 平台去水印解析接口配置已保存');
  };

  const handleTestQiyun = async () => {
    if (!qiyunAppId.trim() || !qiyunAppKey.trim()) {
      showToast('⚠️ 请先填写奇云 App ID 和 App Key');
      return;
    }
    setIsTestingQiyun(true);
    try {
      const res = await apiFetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'qiyun',
          qiyunAppId: qiyunAppId.trim(),
          qiyunAppKey: qiyunAppKey.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🟢 ${data.message || '奇云解析接口测试通过！'}`);
      } else {
        showToast(`🔴 奇云接口异常: ${data.error || '无法连通奇云网关'}`);
      }
    } catch (err: unknown) {
      showToast(`🔴 网络超时: ${formatUserError(err, '测试失败')}`);
    } finally {
      setIsTestingQiyun(false);
    }
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
