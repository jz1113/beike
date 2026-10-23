import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { type StorageProvider, QINIU_ZONES } from '../../model/storageValidation';
import { StorageUnderlineInput } from './StorageUnderlineInput';

export interface StorageProviderFieldsetsProps {
  storageProvider: StorageProvider;
  storageBucketName: string;
  setStorageBucketName: (v: string) => void;
  storageEndpoint: string;
  setStorageEndpoint: (v: string) => void;
  storageAccessKeyId: string;
  setStorageAccessKeyId: (v: string) => void;
  storageSecretAccessKey: string;
  setStorageSecretAccessKey: (v: string) => void;
  showStorageSecret: boolean;
  setShowStorageSecret: (v: boolean) => void;
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
}

export function StorageProviderFieldsets(p: StorageProviderFieldsetsProps) {
  const [bucketSecretVisible, setBucketSecretVisible] = useState(false);
  const [domainSecretVisible, setDomainSecretVisible] = useState(false);

  return (
    <div className="space-y-5">
      {/* 阿里云 OSS 专属表单 */}
      {p.storageProvider === 'oss' && (
        <div className="space-y-5">
          <StorageUnderlineInput
            id="oss-bucket"
            label="Bucket"
            value={p.storageBucketName}
            onChange={(e) => p.setStorageBucketName(e.target.value)}
            placeholder="填写 Bucket 名称"
            isSecret
            secretVisible={bucketSecretVisible}
            onToggleSecret={() => setBucketSecretVisible(!bucketSecretVisible)}
          />
          <StorageUnderlineInput
            id="oss-endpoint"
            label="Endpoint"
            value={p.storageEndpoint}
            onChange={(e) => p.setStorageEndpoint(e.target.value)}
            placeholder="如 oss-cn-beijing.aliyuncs.com"
          />
          <StorageUnderlineInput
            id="oss-api-prefix"
            label="API 前缀"
            value={p.storageApiPrefix || ''}
            onChange={(e) => p.setStorageApiPrefix?.(e.target.value)}
            placeholder="图生视频/Agent 等，如 seedance/"
          />
          <StorageUnderlineInput
            id="oss-materials-prefix"
            label="素材前缀"
            value={p.storageMaterialsPrefix || ''}
            onChange={(e) => p.setStorageMaterialsPrefix?.(e.target.value)}
            placeholder="全局拖入素材，如 canvas-materials/"
          />
          <StorageUnderlineInput
            id="oss-ak-id"
            label="AK ID"
            value={p.storageAccessKeyId}
            onChange={(e) => p.setStorageAccessKeyId(e.target.value)}
          />
          <StorageUnderlineInput
            id="oss-ak-secret"
            label="AK Secret"
            value={p.storageSecretAccessKey}
            onChange={(e) => p.setStorageSecretAccessKey(e.target.value)}
            isSecret
            secretVisible={p.showStorageSecret}
            onToggleSecret={() => p.setShowStorageSecret(!p.showStorageSecret)}
          />
          <StorageUnderlineInput
            id="oss-public-domain"
            label="公开访问域名 / CDN（选填）"
            value={p.storagePublicDomain}
            onChange={(e) => p.setStoragePublicDomain(e.target.value)}
            placeholder="https://cdn.example.com"
            hint="留空时根据存储桶与服务端点生成访问地址，请确认存储桶允许公开读取。"
          />
        </div>
      )}

      {/* Cloudinary (免费) 专属表单 */}
      {p.storageProvider === 'cloudinary' && (
        <div className="space-y-5">
          <StorageUnderlineInput
            id="cloudinary-cloud-name"
            label="Cloud Name"
            value={p.storageCloudName || ''}
            onChange={(e) => p.setStorageCloudName?.(e.target.value)}
            placeholder="与控制台 Dashboard 中 Cloud name 完全一致"
          />
          <StorageUnderlineInput
            id="cloudinary-api-key"
            label="API Key"
            value={p.storageAccessKeyId}
            onChange={(e) => p.setStorageAccessKeyId(e.target.value)}
          />
          <StorageUnderlineInput
            id="cloudinary-api-secret"
            label="API Secret"
            value={p.storageSecretAccessKey}
            onChange={(e) => p.setStorageSecretAccessKey(e.target.value)}
            isSecret
            secretVisible={p.showStorageSecret}
            onToggleSecret={() => p.setShowStorageSecret(!p.showStorageSecret)}
          />
          <StorageUnderlineInput
            id="cloudinary-api-prefix"
            label="API 文件夹"
            value={p.storageApiPrefix || ''}
            onChange={(e) => p.setStorageApiPrefix?.(e.target.value)}
            placeholder="图生视频/Agent 等，如 seedance"
          />
          <StorageUnderlineInput
            id="cloudinary-materials-prefix"
            label="素材前缀"
            value={p.storageMaterialsPrefix || ''}
            onChange={(e) => p.setStorageMaterialsPrefix?.(e.target.value)}
            placeholder="全局拖入素材，如 canvas-materials/"
            hint="与阿里云 OSS 的「素材前缀」相同：拖入画布的图片/视频会上传到该目录下的 images、thumbnails、videos 等子文件夹。"
          />
        </div>
      )}

      {/* 七牛云 专属表单 */}
      {p.storageProvider === 'qiniu' && (
        <div className="space-y-5">
          <StorageUnderlineInput
            id="qiniu-bucket"
            label="Bucket"
            value={p.storageBucketName}
            onChange={(e) => p.setStorageBucketName(e.target.value)}
            placeholder="填写 Bucket 名称"
            isSecret
            secretVisible={bucketSecretVisible}
            onToggleSecret={() => setBucketSecretVisible(!bucketSecretVisible)}
          />

          {/* 存储区域下拉 */}
          <div className="space-y-1">
            <label htmlFor="qiniu-zone" className="block text-sm font-bold text-slate-900 select-none dark:text-slate-100">
              存储区域
            </label>
            <div className="relative flex items-center border-b border-slate-200/90 focus-within:border-slate-800 transition-colors dark:border-white/10">
              <select
                id="qiniu-zone"
                value={p.storageZone || 'z2'}
                onChange={(e) => p.setStorageZone?.(e.target.value)}
                className="storage-underline-input w-full bg-transparent border-0 px-0 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-0 leading-relaxed cursor-pointer appearance-none pr-8 dark:text-slate-100"
              >
                {QINIU_ZONES.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 h-4 w-4 text-slate-400" />
            </div>
          </div>

          <StorageUnderlineInput
            id="qiniu-domain"
            label="外链域名"
            value={p.storagePublicDomain}
            onChange={(e) => p.setStoragePublicDomain(e.target.value)}
            placeholder="CDN 测试域名，如 th1b3suy7.hn-bkt.clouddn.com"
            isSecret
            secretVisible={domainSecretVisible}
            onToggleSecret={() => setDomainSecretVisible(!domainSecretVisible)}
            hint="七牛云空间分配的测试域名或自定义加速域名，留空将无法直接外链预览。"
          />
          <StorageUnderlineInput
            id="qiniu-api-prefix"
            label="API 前缀"
            value={p.storageApiPrefix || ''}
            onChange={(e) => p.setStorageApiPrefix?.(e.target.value)}
            placeholder="图生视频/Agent 等，如 seedance/"
          />
          <StorageUnderlineInput
            id="qiniu-materials-prefix"
            label="素材前缀"
            value={p.storageMaterialsPrefix || ''}
            onChange={(e) => p.setStorageMaterialsPrefix?.(e.target.value)}
            placeholder="全局拖入素材，如 canvas-materials/"
          />
          <StorageUnderlineInput
            id="qiniu-access-id"
            label="Access Key"
            value={p.storageAccessKeyId}
            onChange={(e) => p.setStorageAccessKeyId(e.target.value)}
            placeholder="个人中心 -> 密钥管理"
          />
          <StorageUnderlineInput
            id="qiniu-secret"
            label="Secret Key"
            value={p.storageSecretAccessKey}
            onChange={(e) => p.setStorageSecretAccessKey(e.target.value)}
            isSecret
            secretVisible={p.showStorageSecret}
            onToggleSecret={() => p.setShowStorageSecret(!p.showStorageSecret)}
          />
        </div>
      )}
    </div>
  );
}
