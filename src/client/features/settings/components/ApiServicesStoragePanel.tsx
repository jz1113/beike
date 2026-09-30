import { Database, Loader2, RotateCcw } from 'lucide-react';
import { storageConfigError } from '../model/storageValidation';
import { useStorageMigration } from '../hooks/useStorageMigration';
import { SettingsServiceHeader, SettingsField, SettingsSecretField, SettingsActions, SettingsToggle } from './SettingsControls';

export interface ApiServicesStoragePanelProps {
  storageEnabled: boolean;
  setStorageEnabled: (v: boolean) => void;
  storageProvider: 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase';
  setStorageProvider: (v: 'r2' | 'oss' | 'cos' | 's3' | 'minio' | 'supabase') => void;
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
  isTestingStorage: boolean;
  handleTestStorage: () => Promise<void>;
  isMigratingStorage: boolean;
  setIsMigratingStorage: (v: boolean) => void;
  handleSaveStorageConfig: () => void;
  showToast: (msg: string) => void;
}

export function ApiServicesStoragePanel(p: ApiServicesStoragePanelProps) {
  const config = { provider: p.storageProvider, accountId: p.storageAccountId, endpoint: p.storageEndpoint,
    accessKeyId: p.storageAccessKeyId, secretAccessKey: p.storageSecretAccessKey,
    bucketName: p.storageBucketName, publicDomain: p.storagePublicDomain };
  const migration = useStorageMigration({ config, enabled: p.storageEnabled,
    setIsMigratingStorage: p.setIsMigratingStorage, showToast: p.showToast });
  const error = storageConfigError(config, { requirePublicDomain: p.storageEnabled });
  const domainRequired = ['r2', 'supabase'].includes(p.storageProvider);
  return <div className="settings-service-form">
    <SettingsServiceHeader icon={<Database className="h-5 w-5 text-slate-600" />} title="对象存储" description="将生成的图片和视频保存到云端"
      action={<SettingsToggle label="成品上传到对象存储" checked={p.storageEnabled} disabled={p.isMigratingStorage} onChange={p.setStorageEnabled} />}
      actions={<SettingsActions onTest={() => void p.handleTestStorage()} onSave={p.handleSaveStorageConfig} testing={p.isTestingStorage} disabled={p.isMigratingStorage} testDisabled={Boolean(storageConfigError(config, { requirePublicDomain: false }))} />} />
    <p className="settings-field-note">{p.storageEnabled ? '保存配置后，生成结果将转存到云端。' : '保存配置后，生成结果保存在本机。'}模型调用所需的参考文件仍可能临时上传。</p>
    <fieldset disabled={p.isMigratingStorage} className="min-w-0 border-0 p-0 space-y-4">
      <div className="settings-form-field"><label>存储服务商</label><div className="settings-provider-options">
        {([{ id: 'oss', name: '阿里云 OSS' }, { id: 'cos', name: '腾讯云 COS' }, { id: 'r2', name: 'Cloudflare R2' },
          { id: 's3', name: 'Amazon S3' }, { id: 'minio', name: 'MinIO' }, { id: 'supabase', name: 'Supabase' }] as const)
          .map(provider => <button key={provider.id} type="button" aria-pressed={p.storageProvider === provider.id} onClick={() => p.setStorageProvider(provider.id)}>{provider.name}</button>)}
      </div></div>
      {p.storageProvider === 'r2' && <SettingsField id="storage-account" label="Cloudflare 账户 ID" value={p.storageAccountId} onChange={event => p.setStorageAccountId(event.target.value)} hint="填写账户 ID 后可自动生成 R2 Endpoint，也可直接填写完整端点。" />}
      <div className="settings-fields-grid">
        <SettingsField id="storage-endpoint" label="服务端点 · Endpoint" value={p.storageEndpoint} onChange={event => p.setStorageEndpoint(event.target.value)} placeholder={p.storageProvider === 'cos' ? 'https://cos.ap-guangzhou.myqcloud.com' : p.storageProvider === 'oss' ? 'https://oss-cn-hangzhou.aliyuncs.com' : 'https://s3.example.com'} />
        <SettingsField id="storage-bucket" label="存储桶 · Bucket" value={p.storageBucketName} onChange={event => p.setStorageBucketName(event.target.value)} placeholder="存储桶名称" />
        <SettingsField id="storage-access-id" label={p.storageProvider === 'cos' ? 'Secret ID' : 'Access Key ID'} value={p.storageAccessKeyId} onChange={event => p.setStorageAccessKeyId(event.target.value)} placeholder="输入访问密钥 ID" />
        <SettingsSecretField id="storage-secret" label={p.storageProvider === 'cos' ? 'Secret Key' : 'Access Key Secret'} value={p.storageSecretAccessKey} onChange={event => p.setStorageSecretAccessKey(event.target.value)} visible={p.showStorageSecret} onVisibleChange={p.setShowStorageSecret} placeholder="输入访问密钥" />
      </div>
      <SettingsField id="storage-domain" label={`公开访问域名 / CDN${domainRequired ? '（成品上传必填）' : '（选填）'}`} value={p.storagePublicDomain} onChange={event => p.setStoragePublicDomain(event.target.value)} placeholder="https://cdn.example.com" hint={domainRequired ? '使用可公开读取媒体的域名，不能填写需要鉴权的 S3 API 端点。' : '留空时根据存储桶与服务端点生成访问地址，请确认存储桶允许公开读取。'} />
    </fieldset>
    {error && (p.storageAccessKeyId || p.storageEndpoint || p.storageAccountId) && <p role="alert" className="settings-alert settings-alert-warning">{error}</p>}
    <details className="settings-details"><summary>历史文件迁移</summary><div className="settings-detail-content">
      <p>逐批扫描所有历史任务，将临时链接转存到当前存储桶，可能产生存储与流量费用。</p>
      {migration.progress && <p role="status">已扫描 {migration.progress.total} 条 · 转存 {migration.progress.migrated} 条 · 失败 {migration.progress.failed} 条</p>}
      {migration.status && <p role="status" className="break-words">{migration.status}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={p.isMigratingStorage || p.isTestingStorage || !p.storageEnabled} onClick={() => void migration.migrate()} className="settings-button-secondary w-fit">{p.isMigratingStorage ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{p.isMigratingStorage ? '迁移中…' : '迁移历史文件'}</button>
        {p.isMigratingStorage && <button type="button" onClick={migration.stop} className="settings-button-secondary">停止后续批次</button>}
      </div>
    </div></details>
  </div>;
}
