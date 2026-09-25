import {storageProviderError} from '../storageValidation';
import { Database, Eye, EyeOff, Loader2, RotateCcw, Zap } from 'lucide-react';
import { apiFetch } from '@/shared/api/apiClient';
import { formatUserError } from '@beike/domain/upstreamErrors';

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
  return (
    <div className="space-y-4">
      {/* 1. 服务概览卡片 */}
      <div className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-5 shadow-2xs">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/10 to-indigo-500/20 border border-indigo-200/60 flex items-center justify-center text-indigo-600 shadow-2xs shrink-0 mt-0.5">
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  对象存储 (阿里云 OSS / 腾讯云 COS)
                </h3>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${
                  storageEnabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${storageEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {storageEnabled ? '成品上传已开启' : '成品留在本机'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                关闭时，生图和生视频成品保存在本机。打开后，成片才会转存到对象存储。模型需要公网拉取的参考文件仍会单独上传，并使用短时签名地址。
              </p>
            </div>
          </div>

          {/* iOS 风格平滑微拟态开关 */}
          <button
            type="button"
            role="switch"
            aria-checked={storageEnabled}
            onClick={() => {
              const nextVal = !storageEnabled;
              setStorageEnabled(nextVal);
              localStorage.setItem('storage_enabled', String(nextVal));
              showToast(nextVal ? '已开启成品上传到对象存储' : '成品改为保存在本机');
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              storageEnabled ? 'bg-emerald-500' : 'bg-slate-200'
            }`}
            title={storageEnabled ? '点击后成品只保存在本机' : '点击后成品也上传到对象存储'}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                storageEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 2. 存储提供商选择与配置卡片 */}
      <div className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-5 shadow-2xs space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-2">存储服务商 (Storage Provider)</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'oss', name: '阿里云 OSS', badge: '国内主流 · 极速' },
              { id: 'cos', name: '腾讯云 COS', badge: '腾讯云生态 · 稳定' }
            ].map(p => {
              const isSelected = storageProvider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setStorageProvider(p.id as any);
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50/60 border-indigo-300 ring-1 ring-indigo-300/50 text-indigo-950 shadow-2xs'
                      : 'bg-slate-50/60 hover:bg-slate-100/70 border-slate-200/80 text-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs sm:text-sm">{p.name}</div>
                  <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}>
                    {p.badge}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {storageEndpoint.trim() && storageProviderError(storageProvider,storageEndpoint) && <p role="alert" className="text-xs text-amber-700">{storageProviderError(storageProvider,storageEndpoint)}</p>}
        {/* 对象存储 Endpoint (端点 URL) */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">
            对象存储 Endpoint (端点 URL)
          </label>
          <input
            type="text"
            value={storageEndpoint}
            onChange={e => {
              setStorageEndpoint(e.target.value);
              localStorage.setItem('storage_endpoint', e.target.value);
            }}
            placeholder={storageProvider === 'cos' ? '例如: https://cos.ap-guangzhou.myqcloud.com' : '例如: https://oss-cn-hangzhou.aliyuncs.com'}
            className="w-full px-3.5 py-2 rounded-xl bg-slate-50/50 border border-slate-200 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-hidden shadow-2xs"
          />
        </div>

        {/* 存储桶名称 */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">存储桶名称 (Bucket Name)</label>
          <input
            type="text"
            value={storageBucketName}
            onChange={e => {
              setStorageBucketName(e.target.value);
              localStorage.setItem('storage_bucket_name', e.target.value);
            }}
            placeholder="例如: beikeyuntu-assets"
            className="w-full px-3.5 py-2 rounded-xl bg-slate-50/50 border border-slate-200 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-hidden shadow-2xs"
          />
        </div>

        {/* 凭证两列 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              访问密钥 ID (Access Key ID / SecretId)
            </label>
            <input
              type="text"
              value={storageAccessKeyId}
              onChange={e => {
                setStorageAccessKeyId(e.target.value);
                localStorage.setItem('storage_access_key_id', e.target.value);
              }}
              placeholder={storageProvider === 'cos' ? "填写腾讯云 API 的 SecretId" : "填写阿里云 RAM 用户的 AccessKey ID"}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50/50 border border-slate-200 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-hidden shadow-2xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              秘密访问密钥 (Secret Access Key / SecretKey)
            </label>
            <div className="relative">
              <input
                type={showStorageSecret ? "text" : "password"}
                value={storageSecretAccessKey}
                onChange={e => setStorageSecretAccessKey(e.target.value)}
                placeholder={storageProvider === 'cos' ? "填写腾讯云 API 的 SecretKey" : "填写阿里云 RAM 用户的 AccessKey Secret"}
                className="w-full pl-3.5 pr-9 py-2 rounded-xl bg-slate-50/50 border border-slate-200 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-hidden shadow-2xs"
              />
              <button
                type="button"
                onClick={() => setShowStorageSecret(!showStorageSecret)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                {showStorageSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* 公开访问域名 */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5">公开访问域名 (Public Domain / CDN)</label>
          <input
            type="text"
            value={storagePublicDomain}
            onChange={e => {
              setStoragePublicDomain(e.target.value);
              localStorage.setItem('storage_public_domain', e.target.value);
            }}
            placeholder={
              storageProvider === 'cos'
                ? '例如: https://<Bucket名>.cos.ap-guangzhou.myqcloud.com (选填)'
                : '例如: https://<Bucket名>.oss-cn-hangzhou.aliyuncs.com (选填)'
            }
            className="w-full px-3.5 py-2 rounded-xl bg-slate-50/50 border border-slate-200 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-hidden shadow-2xs"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            {storageProvider === 'cos'
              ? '腾讯云 COS 存储桶外网访问域名（若选填则系统自动按 Bucket + Endpoint 生成）'
              : '阿里云 OSS 存储桶外网访问域名（若选填则系统自动按 Bucket + Endpoint 生成）'}
          </p>
        </div>

        {/* 操作按钮区 */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isTestingStorage}
              onClick={() => void handleTestStorage()}
              className="px-3.5 py-2 rounded-xl bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/70 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              {isTestingStorage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              <span>测试存储连接</span>
            </button>

            <button
              type="button"
              disabled={isMigratingStorage || !storageEnabled}
              onClick={async () => {
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
                } catch (e: any) {
                  showToast('迁移异常: ' + formatUserError(e));
                } finally {
                  setIsMigratingStorage(false);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-amber-50/80 hover:bg-amber-100 text-amber-800 border border-amber-200/70 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              {isMigratingStorage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              <span>迁移历史链接到对象存储</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveStorageConfig}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition-colors cursor-pointer shadow-xs"
          >
            保存存储配置
          </button>
        </div>
      </div>
    </div>
  );
}
