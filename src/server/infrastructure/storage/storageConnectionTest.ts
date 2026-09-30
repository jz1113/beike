import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { storageClientOptions, type StorageConfig } from './storageConfiguration';

export async function testResolvedStorageConnection(resolved: StorageConfig | null): Promise<{
  success: boolean;
  message?: string;
  testUrl?: string;
}> {
  try {
    if (!resolved) {
      return { success: false, message: '配置不完整，请填写 Access Key ID、Secret 和 存储桶名称' };
    }

    const s3 = new S3Client(storageClientOptions(resolved));
    const testKey = `azhuo/health_check_${Date.now()}.txt`;
    const testBody = Buffer.from(`Azhuo Studio Cloud Storage Health Check - ${new Date().toISOString()}`);

    await s3.send(new PutObjectCommand({
      Bucket: resolved.bucketName,
      Key: testKey,
      Body: testBody,
      ContentType: 'text/plain',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    await s3.send(new DeleteObjectCommand({
      Bucket: resolved.bucketName,
      Key: testKey,
    })).catch((err) => {
      console.warn('[对象存储] 测试文件删除失败:', err);
    });

    let testUrl = '';
    if (resolved.publicDomain) {
      testUrl = `${resolved.publicDomain}/${testKey}`;
    } else if (resolved.endpoint) {
      if (resolved.provider === 'oss') {
        const cleanEndpoint = resolved.endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        testUrl = `https://${resolved.bucketName}.${cleanEndpoint}/${testKey}`;
      } else {
        testUrl = `${resolved.endpoint}/${resolved.bucketName}/${testKey}`;
      }
    }

    return {
      success: true,
      message: '🎉 存储桶连接与写入权限验证成功！',
      testUrl
    };
  } catch (error: unknown) {
    return {
      success: false,
      message: `连接失败: ${formatUserError(error, '网络连接超时或凭证无效')}`
    };
  }
}



