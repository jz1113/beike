import { useContext } from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { storageConfigError, type StorageProvider } from '../../model/storageValidation';
import { useStorageMigration } from '../../hooks/useStorageMigration';
import { SettingsConnectionContext } from '../SettingsControls';
import { StorageProviderFieldsets } from './StorageProviderFieldsets';

export interface ApiServicesStoragePanelProps {
  storageEnabled: boolean;
  setStorageEnabled: (v: boolean) => void;
  storageProvider: StorageProvider;
  setStorageProvider: (v: StorageProvider) => void;
  storageAccountId: string;
  setStorageAccountId: (v: string) => void;
  storageEndpoint: string;
  setStorageEndpoint: (v: string) => void;
  storageAccessKeyId: string;
  setStorageAccessKeyId: (v: string) => void;
  storageSecretAccessKey: string;
  setStorageSecretAccessKey: (v: string) => void;
  showStorageSecret: boolean;
  setShowStorageSecret: (v: boolean) => void;
  storageBucketName: string;
  setStorageBucketName: (v: string) => void;
  storagePublicDomain: string;
  setStoragePublicDomain: (v: string) => void;
  storageApiPrefix?: string;
  setStorageApiPrefix?: (v: string) => void;
  storageMaterialsPrefix?: string;
  setStorageMaterialsPrefix?: (v: string) => void;
  storageCloudName?: string;
  setStorageCloudName?: (v: string) => void;
  storageZone?: string;
  setStorageZone?: (v: string) => void;
  isTestingStorage: boolean;
  handleTestStorage: () => Promise<void>;
  isMigratingStorage: boolean;
  setIsMigratingStorage: (v: boolean) => void;
  handleSaveStorageConfig: () => void;
  showToast: (msg: string) => void;
}

const STORAGE_PROVIDERS = [
  { id: 'oss', name: '阿里云 OSS' },
  { id: 'cloudinary', name: 'Cloudinary (免费)' },
  { id: 'qiniu', name: '七牛云' },
] as const;

export function ApiServicesStoragePanel(p: ApiServicesStoragePanelProps) {
  const statusBadge = useContext(SettingsConnectionContext);

  const config = {
    provider: p.storageProvider,
    accountId: p.storageAccountId,
    endpoint: p.storageEndpoint,
    accessKeyId: p.storageAccessKeyId,
    secretAccessKey: p.storageSecretAccessKey,
    bucketName: p.storageBucketName,
    publicDomain: p.storagePublicDomain,
    apiPrefix: p.storageApiPrefix || 'seedance/',
    materialsPrefix: p.storageMaterialsPrefix || 'canvas-materials/',
    cloudName: p.storageCloudName || '',
    zone: p.storageZone || 'z2',
  };

  const migration = useStorageMigration({
    config,
    enabled: p.storageEnabled,
    setIsMigratingStorage: p.setIsMigratingStorage,
    showToast: p.showToast,
  });
  const error = storageConfigError(config, { requirePublicDomain: p.storageEnabled });

  return (
    <div className="space-y-6 w-full max-w-3xl">
      {/* 顶部标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white select-none">
            图床 / 媒体存储
          </h1>
          {statusBadge}
        </div>
      </div>

      {/* 全局素材上传说明与 Switch 开关 */}
      <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 dark:border-white/[0.08]">
        <div className="space-y-1 pr-4">
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">全局素材上传</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            画布素材默认走当前图床。Cloudinary 免费额度有限，建议只在需要的节点单独上传。
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={p.storageEnabled}
          aria-label="全局素材上传开关"
          disabled={p.isMigratingStorage}
          onClick={() => p.setStorageEnabled(!p.storageEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            p.storageEnabled ? 'bg-slate-900 dark:bg-indigo-600' : 'bg-slate-300 dark:bg-white/20'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
              p.storageEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* 提供商切换组 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 pb-3">
        <div className="space-y-1">
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">提供商</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {p.storageProvider === 'cloudinary'
              ? '使用此方案建议不要开「全局素材上传」；免费版有流量额度，建议仅在节点勾选单独上传即可。'
              : '选择图床服务。'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {STORAGE_PROVIDERS.map((provider) => {
            const active = p.storageProvider === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => p.setStorageProvider(provider.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-[#18181b] text-white shadow-xs dark:bg-white dark:text-slate-900'
                    : 'bg-[#f4f4f5] text-slate-700 hover:bg-[#e4e4e7] hover:text-slate-900 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                {active && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                <span>{provider.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 服务商专属底线字段表单 */}
      <fieldset disabled={p.isMigratingStorage} className="min-w-0 border-0 p-0">
        <StorageProviderFieldsets
          storageProvider={p.storageProvider}
          storageBucketName={p.storageBucketName}
          setStorageBucketName={p.setStorageBucketName}
          storageEndpoint={p.storageEndpoint}
          setStorageEndpoint={p.setStorageEndpoint}
          storageAccessKeyId={p.storageAccessKeyId}
          setStorageAccessKeyId={p.setStorageAccessKeyId}
          storageSecretAccessKey={p.storageSecretAccessKey}
          setStorageSecretAccessKey={p.setStorageSecretAccessKey}
          showStorageSecret={p.showStorageSecret}
          setShowStorageSecret={p.setShowStorageSecret}
          storagePublicDomain={p.storagePublicDomain}
          setStoragePublicDomain={p.setStoragePublicDomain}
          storageApiPrefix={p.storageApiPrefix}
          setStorageApiPrefix={p.setStorageApiPrefix}
          storageMaterialsPrefix={p.storageMaterialsPrefix}
          setStorageMaterialsPrefix={p.setStorageMaterialsPrefix}
          storageCloudName={p.storageCloudName}
          setStorageCloudName={p.setStorageCloudName}
          storageZone={p.storageZone}
          setStorageZone={p.setStorageZone}
        />
      </fieldset>

      {/* 校验错误提示 */}
      {error && (p.storageAccessKeyId || p.storageEndpoint || p.storageAccountId || p.storageCloudName) && (
        <p role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-300 rounded-lg p-2.5">
          {error}
        </p>
      )}

      {/* 底部操作行：左侧测试上传，右侧保存配置 */}
      <div className="pt-4 pb-2 flex items-center justify-between border-t border-slate-100 dark:border-white/[0.08]">
        <button
          type="button"
          onClick={() => void p.handleTestStorage()}
          disabled={p.isTestingStorage || p.isMigratingStorage}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-50"
        >
          {p.isTestingStorage ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>测试中…</span>
            </>
          ) : (
            <span>测试上传</span>
          )}
        </button>

        <button
          type="button"
          onClick={p.handleSaveStorageConfig}
          disabled={p.isMigratingStorage}
          className="px-4 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-xs font-medium transition-all shadow-xs cursor-pointer"
        >
          保存配置
        </button>
      </div>

      {/* 历史文件迁移（折叠） */}
      <details className="settings-details text-xs text-slate-500 dark:text-slate-400">
        <summary className="cursor-pointer hover:text-slate-700 dark:hover:text-slate-200 select-none">历史文件迁移</summary>
        <div className="settings-detail-content pt-3 space-y-2">
          <p>逐批扫描所有历史任务，将临时链接转存到当前存储空间，可能产生存储与流量费用。</p>
          {migration.progress && (
            <p role="status">
              已扫描 {migration.progress.total} 条 · 转存 {migration.progress.migrated} 条 · 失败 {migration.progress.failed} 条
            </p>
          )}
          {migration.status && <p role="status" className="break-words">{migration.status}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={p.isMigratingStorage || p.isTestingStorage || !p.storageEnabled}
              onClick={() => void migration.migrate()}
              className="settings-button-secondary w-fit text-xs px-3 py-1.5"
            >
              {p.isMigratingStorage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              {p.isMigratingStorage ? '迁移中…' : '迁移历史文件'}
            </button>
            {p.isMigratingStorage && (
              <button type="button" onClick={migration.stop} className="settings-button-secondary text-xs px-3 py-1.5">
                停止后续批次
              </button>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
