import { apiFetch } from '@client/shared/api/apiClient';
import { storageConfigError, type StorageProvider, normalizeStorageUrl, QINIU_ZONES } from '../model/storageValidation';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  persistAiGatewayConfig,
  persistDeepSeekConfig,
  persistExternalScraperConfig,
  persistQiyunConfig,
  persistStorageConfig,
  persistWanbangConfig,
} from '@client/shared/api/persistCredentials';
import { setClientGatewayApiKey, setClientGatewayBaseUrl } from '@client/shared/api/gatewayClient';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { useIndependentModelProviders } from './useIndependentModelProviders';
import { useConnectionChecks } from './useConnectionChecks';
import { testModelConnection, testScraperConnection, testQiyunConnection, testWanbangConnection } from '../model/settingsConnectionChecks';
import { readSettingsConfig, settingsConfigFingerprint, type SettingsConfigSnapshot } from './readSettingsConfig';
import { useConfigSaveState } from './useConfigSaveState';

interface UseSettingsConfigOptions {
  isOpen: boolean;
  showToast: (msg: string) => void;
}

export function useSettingsConfig({ isOpen, showToast }: UseSettingsConfigOptions) {
  const [mainConfigLoaded, setConfigLoaded] = useState(false);
  const [mainConfigLoadError, setConfigLoadError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [savedConfig, setSavedConfig] = useState<SettingsConfigSnapshot | null>(null);
  const reloadConfig = useCallback(() => setReloadVersion(version => version + 1), []);
  // Comfly API Gateway
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://ai.comfly.org');
  const [showKey, setShowKey] = useState(false);
  const [deepSeekApiKey, setDeepSeekApiKey] = useState('');
  const [showDeepSeekKey, setShowDeepSeekKey] = useState(false);
  const independentProviders = useIndependentModelProviders(isOpen, showToast, reloadVersion);

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
  const [storageProvider, setStorageProvider] = useState<StorageProvider>('oss');
  const [storageAccountId, setStorageAccountId] = useState('');
  const [storageEndpoint, setStorageEndpoint] = useState('');
  const [storageAccessKeyId, setStorageAccessKeyId] = useState('');
  const [storageSecretAccessKey, setStorageSecretAccessKey] = useState('');
  const [showStorageSecret, setShowStorageSecret] = useState(false);
  const [storageBucketName, setStorageBucketName] = useState('');
  const [storagePublicDomain, setStoragePublicDomain] = useState('');
  const [storageApiPrefix, setStorageApiPrefix] = useState('seedance/');
  const [storageMaterialsPrefix, setStorageMaterialsPrefix] = useState('canvas-materials/');
  const [storageCloudName, setStorageCloudName] = useState('');
  const [storageZone, setStorageZone] = useState('z2');
  const [isMigratingStorage, setIsMigratingStorage] = useState(false);

  const storageDrafts = useRef<Record<string, {
    endpoint: string; accountId: string; key: string; secret: string;
    bucket: string; domain: string; apiPrefix: string; materialsPrefix: string;
    cloudName: string; zone: string;
  }>>({});

  const changeStorageProvider = (next: StorageProvider) => {
    if (next === storageProvider) return;
    storageDrafts.current[storageProvider] = {
      endpoint: storageEndpoint, accountId: storageAccountId, key: storageAccessKeyId,
      secret: storageSecretAccessKey, bucket: storageBucketName, domain: storagePublicDomain,
      apiPrefix: storageApiPrefix, materialsPrefix: storageMaterialsPrefix,
      cloudName: storageCloudName, zone: storageZone,
    };
    const draft = storageDrafts.current[next];
    setStorageProvider(next);
    setStorageEndpoint(draft?.endpoint || (next === 'oss' ? 'https://oss-cn-beijing.aliyuncs.com' : ''));
    setStorageAccountId(draft?.accountId || '');
    setStorageAccessKeyId(draft?.key || '');
    setStorageSecretAccessKey(draft?.secret || '');
    setStorageBucketName(draft?.bucket || '');
    setStoragePublicDomain(draft?.domain || '');
    setStorageApiPrefix(draft?.apiPrefix ?? (next === 'cloudinary' ? 'seedance' : 'seedance/'));
    setStorageMaterialsPrefix(draft?.materialsPrefix ?? 'canvas-materials/');
    setStorageCloudName(draft?.cloudName || '');
    setStorageZone(draft?.zone || 'z2');
    setShowStorageSecret(false);
  };

  const onSaved = useCallback((snapshot: Partial<SettingsConfigSnapshot>) => {
    setSavedConfig(previous => previous ? { ...previous, ...snapshot } : previous);
  }, []);
  const saves = useConfigSaveState<SettingsConfigSnapshot>(isOpen && mainConfigLoaded, showToast, onSaved);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    let active = true;
    setConfigLoaded(false);
    setConfigLoadError('');
    setSavedConfig(null);
    void readSettingsConfig().then(config => {
      if (!active) return;
      setBaseUrl(config.baseUrl); setApiKey(config.apiKey); setDeepSeekApiKey(config.deepSeekApiKey);
      setClientGatewayApiKey(config.apiKey); setClientGatewayBaseUrl(config.baseUrl);
      setWanbangKey(config.wanbangKey); setWanbangSecret(config.wanbangSecret); setIsWanbangEnabled(config.isWanbangEnabled);
      setScraperId(config.scraperId); setScraperSecret(config.scraperSecret); setIsApiaEnabled(config.isApiaEnabled);
      setQiyunAppId(config.qiyunAppId); setQiyunAppKey(config.qiyunAppKey); setIsQiyunEnabled(config.isQiyunEnabled);
      setAppAccessToken(config.appAccessToken);
      setStorageEnabled(config.storageEnabled); setStorageProvider(config.storageProvider);
      setStorageAccountId(config.storageAccountId); setStorageEndpoint(config.storageEndpoint);
      setStorageAccessKeyId(config.storageAccessKeyId); setStorageSecretAccessKey(config.storageSecretAccessKey);
      setStorageBucketName(config.storageBucketName); setStoragePublicDomain(config.storagePublicDomain);
      setStorageApiPrefix(config.storageApiPrefix || 'seedance/');
      setStorageMaterialsPrefix(config.storageMaterialsPrefix || 'canvas-materials/');
      setStorageCloudName(config.storageCloudName || '');
      setStorageZone(config.storageZone || 'z2');
      storageDrafts.current = {};
      setSavedConfig(config); setConfigLoaded(true);
    }).catch(error => { if (active) setConfigLoadError(formatUserError(error, '设置加载失败，请重试')); });
    return () => { active = false; };
  }, [isOpen, reloadVersion]);

  const currentStorageDraft = {
    provider: storageProvider,
    accountId: storageAccountId.trim(),
    endpoint: normalizeStorageUrl(storageEndpoint),
    accessKeyId: storageAccessKeyId.trim(),
    secretAccessKey: storageSecretAccessKey.trim(),
    bucketName: storageBucketName.trim(),
    publicDomain: storagePublicDomain.trim(),
    apiPrefix: storageApiPrefix.trim(),
    materialsPrefix: storageMaterialsPrefix.trim(),
    cloudName: storageCloudName.trim(),
    zone: storageZone.trim(),
  };

  const connectionChecks = useConnectionChecks({
    cloud_storage: [
      storageEnabled, storageProvider, storageAccountId, storageEndpoint,
      storageAccessKeyId, storageSecretAccessKey, storageBucketName, storagePublicDomain,
      storageApiPrefix, storageMaterialsPrefix, storageCloudName, storageZone,
    ],
    comfly_gateway: [baseUrl.trim(), apiKey.trim()],
    deepseek_official: [deepSeekApiKey.trim()],
    wanbang_ecommerce: [wanbangKey.trim(), wanbangSecret.trim(), isWanbangEnabled],
    apia_parser: [scraperId.trim(), scraperSecret.trim(), isApiaEnabled],
    qiyun_parser: [qiyunAppId.trim(), qiyunAppKey.trim(), isQiyunEnabled],
  }, showToast, isOpen && mainConfigLoaded);
  const isTestingStorage = Boolean(connectionChecks.testing.cloud_storage);
  const handleTestStorage = () => connectionChecks.run('cloud_storage', async () => {
    let endpoint = currentStorageDraft.endpoint;
    if (storageProvider === 'qiniu') {
      const matched = QINIU_ZONES.find(z => z.id === storageZone);
      endpoint = matched ? matched.endpoint : 'https://s3-cn-south-1.qiniucs.com';
    }
    const configToTest = {
      ...currentStorageDraft,
      endpoint,
    };
    const error = storageConfigError(configToTest, { requirePublicDomain: false });
    if (error) return { ok: false, message: error };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException('存储测试超过 30 秒，请检查配置或网络后重试', 'TimeoutError')), 30_000);
    try {
      const response = await apiFetch('/api/assets/storage/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ config: { ...configToTest, enabled: true, persistResults: false } }),
      });
      const data = await response.json();
      const ok = response.ok && data.success === true;
      return { ok, message: ok ? (data.message || '🎉 存储桶连接与写入权限验证成功！') : `存储连接失败：${data.message || data.error || response.status}` };
    } finally { clearTimeout(timeout); }
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

  const handleSaveDeepSeekConfig = async (notify = true, overrideApiKey?: string) => {
    const snapshot = { deepSeekApiKey: (overrideApiKey ?? deepSeekApiKey).trim() };
    const saved = await saves.save('deepseek_official', snapshot, () => persistDeepSeekConfig(snapshot.deepSeekApiKey), 'DeepSeek 独立凭证已保存', notify);
    if (saved) setDeepSeekApiKey(snapshot.deepSeekApiKey);
    return saved;
  };

  const handleTestWanbang = () => connectionChecks.run('wanbang_ecommerce', () => testWanbangConnection(wanbangKey, wanbangSecret));

  const handleSaveApiConfig = async (newUrl: string, newKey: string, notify = false) => {
    const snapshot = { baseUrl: newUrl.trim(), apiKey: newKey.trim() };
    const saved = await saves.save('comfly_gateway', snapshot, () => persistAiGatewayConfig(snapshot.baseUrl, snapshot.apiKey),
      snapshot.apiKey ? 'Comfly 网关配置已保存' : '已清空 API Key', notify);
    if (saved) {
      setBaseUrl(snapshot.baseUrl);
      setApiKey(snapshot.apiKey);
    }
    return saved;
  };

  const handleSaveWanbangConfig = async () => {
    const snapshot = { wanbangKey: wanbangKey.trim(), wanbangSecret: wanbangSecret.trim(), isWanbangEnabled };
    await saves.save('wanbang_ecommerce', snapshot, () => persistWanbangConfig(snapshot.wanbangKey, snapshot.wanbangSecret, snapshot.isWanbangEnabled), '万邦采集配置已保存');
  };

  const handleSaveScraperConfig = async () => {
    const snapshot = { scraperId: scraperId.trim(), scraperSecret: scraperSecret.trim(), isApiaEnabled };
    await saves.save('apia_parser', snapshot, () => persistExternalScraperConfig(snapshot.scraperId, snapshot.scraperSecret, snapshot.isApiaEnabled), '社媒解析配置已保存');
  };

  const handleTestScraper = () => connectionChecks.run('apia_parser', () => testScraperConnection(scraperId, scraperSecret));

  const handleSaveQiyunConfig = async () => {
    const snapshot = { qiyunAppId: qiyunAppId.trim(), qiyunAppKey: qiyunAppKey.trim(), isQiyunEnabled };
    await saves.save('qiyun_parser', snapshot, () => persistQiyunConfig(snapshot.qiyunAppId, snapshot.qiyunAppKey, snapshot.isQiyunEnabled), '奇云解析配置已保存');
  };

  const handleTestQiyun = () => connectionChecks.run('qiyun_parser', () => testQiyunConnection(qiyunAppId, qiyunAppKey));

  const handleSaveStorageConfig = async () => {
    let endpoint = currentStorageDraft.endpoint;
    if (storageProvider === 'qiniu') {
      const matched = QINIU_ZONES.find(z => z.id === storageZone);
      endpoint = matched ? matched.endpoint : 'https://s3-cn-south-1.qiniucs.com';
    }
    const config = {
      ...currentStorageDraft,
      enabled: storageEnabled,
      endpoint,
    };
    const error = config.enabled ? storageConfigError(config) : '';
    if (error) { showToast(error); return; }
    const snapshot = {
      storageEnabled: config.enabled,
      storageProvider: config.provider,
      storageAccountId: config.accountId,
      storageEndpoint: config.endpoint,
      storageAccessKeyId: config.accessKeyId,
      storageSecretAccessKey: config.secretAccessKey,
      storageBucketName: config.bucketName,
      storagePublicDomain: config.publicDomain,
      storageApiPrefix: config.apiPrefix,
      storageMaterialsPrefix: config.materialsPrefix,
      storageCloudName: config.cloudName,
      storageZone: config.zone,
    };
    await saves.save('cloud_storage', snapshot, () => persistStorageConfig(config), '对象存储配置已保存');
  };

  const currentConfig: SettingsConfigSnapshot = {
    apiKey, baseUrl, deepSeekApiKey, wanbangKey, wanbangSecret, isWanbangEnabled,
    scraperId, scraperSecret, isApiaEnabled, qiyunAppId, qiyunAppKey, isQiyunEnabled, appAccessToken, storageEnabled,
    storageProvider, storageAccountId, storageEndpoint, storageAccessKeyId, storageSecretAccessKey, storageBucketName, storagePublicDomain,
    storageApiPrefix, storageMaterialsPrefix, storageCloudName, storageZone,
  };
  const configLoaded = mainConfigLoaded && independentProviders.independentConfigLoaded;
  const mainHasUnsavedChanges = Boolean(
    configLoaded
    && savedConfig
    && settingsConfigFingerprint(currentConfig) !== settingsConfigFingerprint(savedConfig),
  );

  return {
    configLoaded,
    configLoadError: mainConfigLoadError || independentProviders.independentConfigLoadError,
    reloadConfig,
    isSavingConfig: saves.isSaving || independentProviders.independentIsSavingConfig,
    hasUnsavedChanges: mainHasUnsavedChanges || independentProviders.independentHasUnsavedChanges,
    gatewaySaveState: saves.states.comfly_gateway || 'idle',
    gatewaySavedConfig: savedConfig ? { baseUrl: savedConfig.baseUrl, apiKey: savedConfig.apiKey } : null,
    isSavingGateway: saves.states.comfly_gateway === 'saving',
    isSavingDeepSeek: saves.states.deepseek_official === 'saving',
    isSavingWanbang: saves.states.wanbang_ecommerce === 'saving',
    isSavingScraper: saves.states.apia_parser === 'saving',
    isSavingQiyun: saves.states.qiyun_parser === 'saving',
    isSavingStorage: saves.states.cloud_storage === 'saving',
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
    storageApiPrefix,
    setStorageApiPrefix,
    storageMaterialsPrefix,
    setStorageMaterialsPrefix,
    storageCloudName,
    setStorageCloudName,
    storageZone,
    setStorageZone,
    isTestingStorage,
    handleTestStorage,
    isMigratingStorage,
    setIsMigratingStorage,
    handleSaveStorageConfig,
  };
}
