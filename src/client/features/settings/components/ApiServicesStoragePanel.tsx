import { storageProviderError } from '../model/storageValidation';
import { Database, Loader2, RotateCcw } from 'lucide-react';
import { apiFetch } from '@client/shared/api/apiClient';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
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

export function ApiServicesStoragePanel({
  storageEnabled,
  setStorageEnabled,
  storageProvider,
  setStorageProvider,
  storageAccountId,
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
  showToast,
}: ApiServicesStoragePanelProps) {
  const handleMigration = async () => {
                if (!storageEnabled) {
                  showToast('请先开启成品上传');
                  return;
                }
                if (!window.confirm('会把历史临时链接重新上传到对象存储，并产生流量费用。确定继续？')) return;
                if (!storageAccessKeyId.trim() || !storageBucketName.trim()) {
                  showToast('请先填写 Access Key 与 存储桶名称');
                  return;
                }
                const error=storageProviderError(storageProvider,storageEndpoint);
                if(error){showToast(error);return;}
                setIsMigratingStorage(true);
                try {
                  const res = await apiFetch('/api/assets/storage/migrate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      config: {
                        enabled: true,
                        persistResults: true,
                        provider: storageProvider,
                        accountId: storageAccountId,
                        endpoint: storageEndpoint,
                        accessKeyId: storageAccessKeyId,
                        secretAccessKey: storageSecretAccessKey,
                        bucketName: storageBucketName,
                        publicDomain: storagePublicDomain
                      }
                    })
                  });
                  const data = await res.json();
                  if (data.success) {
                    showToast(data.message || '历史临时链接迁移成功');
                  } else {
                    showToast('迁移失败: ' + (data.error || '执行异常'));
                  }
                } catch (e: unknown) {
                  showToast('迁移异常: ' + formatUserError(e));
                } finally {
                  setIsMigratingStorage(false);
                }
              };
  return <div className="settings-service-form">
    <SettingsServiceHeader icon={<Database className="h-5 w-5 text-slate-600" />} title="对象存储" description="将生成的图片和视频保存到云端"
      action={<SettingsToggle label="成品上传到对象存储" checked={storageEnabled} onChange={value => { setStorageEnabled(value); localStorage.setItem('storage_enabled', String(value)); showToast(value ? '已开启成品上传到对象存储' : '成品改为保存在本机'); }} />} actions={<SettingsActions onTest={() => void handleTestStorage()} onSave={handleSaveStorageConfig} testing={isTestingStorage} testDisabled={!storageEndpoint.trim() || !storageBucketName.trim() || !storageAccessKeyId.trim()} />} />
    <p className="settings-field-note">{storageEnabled ? '生成结果将转存到云端。' : '生成结果保存在本机。'}模型调用所需的参考文件仍可能临时上传。</p>
    <div className="settings-form-field"><label>存储服务商</label><div className="settings-provider-options">
      {([{ id: 'oss', name: '阿里云 OSS' }, { id: 'cos', name: '腾讯云 COS' }] as const).map(provider => <button key={provider.id} type="button" aria-pressed={storageProvider === provider.id} onClick={() => setStorageProvider(provider.id)}>{provider.name}</button>)}
      {!['oss', 'cos'].includes(storageProvider) && <span>当前：{storageProvider.toUpperCase()}</span>}
    </div></div>
    <div className="settings-fields-grid">
      <SettingsField id="storage-endpoint" label="服务端点 · Endpoint" value={storageEndpoint} onChange={event => { setStorageEndpoint(event.target.value); localStorage.setItem('storage_endpoint', event.target.value); }} placeholder={storageProvider === 'cos' ? 'https://cos.ap-guangzhou.myqcloud.com' : 'https://oss-cn-hangzhou.aliyuncs.com'} />
      <SettingsField id="storage-bucket" label="存储桶 · Bucket" value={storageBucketName} onChange={event => { setStorageBucketName(event.target.value); localStorage.setItem('storage_bucket_name', event.target.value); }} placeholder="存储桶名称" />
      <SettingsField id="storage-access-id" label={storageProvider === 'cos' ? 'Secret ID' : 'Access Key ID'} value={storageAccessKeyId} onChange={event => { setStorageAccessKeyId(event.target.value); localStorage.setItem('storage_access_key_id', event.target.value); }} placeholder="输入访问密钥 ID" />
      <SettingsSecretField id="storage-secret" label={storageProvider === 'cos' ? 'Secret Key' : 'Access Key Secret'} value={storageSecretAccessKey} onChange={event => setStorageSecretAccessKey(event.target.value)} visible={showStorageSecret} onVisibleChange={setShowStorageSecret} placeholder="输入访问密钥" />
    </div>
    {storageEndpoint.trim() && storageProviderError(storageProvider, storageEndpoint) && <p role="alert" className="settings-alert settings-alert-warning">{storageProviderError(storageProvider, storageEndpoint)}</p>}
    <SettingsField id="storage-domain" label="访问域名 / CDN（选填）" value={storagePublicDomain} onChange={event => { setStoragePublicDomain(event.target.value); localStorage.setItem('storage_public_domain', event.target.value); }} placeholder="https://cdn.example.com" hint="留空时，自动根据存储桶与服务端点生成访问地址。" />
    <details className="settings-details"><summary>历史文件迁移</summary><div className="settings-detail-content"><p>将历史临时链接转存到当前存储桶，可能产生存储与流量费用。</p><button type="button" disabled={isMigratingStorage || !storageEnabled} onClick={handleMigration} className="settings-button-secondary w-fit">{isMigratingStorage ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{isMigratingStorage ? '迁移中…' : '迁移历史文件'}</button></div></details>
  </div>;
}
