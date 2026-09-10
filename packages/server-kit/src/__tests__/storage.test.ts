import { describe, expect, it } from 'vitest';
import { buildStorageKey, extractStorageKeyFromUrl, deleteObjectsFromStorage } from '../storage';

describe('Aliyun OSS Storage Architecture & Key Resolution', () => {
  it('correctly builds keys for products category', () => {
    const key = buildStorageKey('products', 'jpg', 'custom_prod.jpg');
    expect(key).toMatch(/^azhuo\/products\/\d{6}\/custom_prod\.jpg$/);

    const autoKey = buildStorageKey('products', 'png');
    expect(autoKey).toMatch(/^azhuo\/products\/\d{6}\/azhuo_prod_\d+_[a-z0-9]+\.png$/);
  });

  it('correctly builds keys for external scraped links category', () => {
    const key = buildStorageKey('external', 'jpg', 'custom_ext.jpg');
    expect(key).toMatch(/^azhuo\/external\/\d{6}\/custom_ext\.jpg$/);

    const autoKey = buildStorageKey('external', 'webp');
    expect(autoKey).toMatch(/^azhuo\/external\/\d{6}\/azhuo_ext_\d+_[a-z0-9]+\.webp$/);
  });

  it('correctly builds keys for generated images and videos', () => {
    const imgKey = buildStorageKey('generated/images', 'jpg');
    expect(imgKey).toMatch(/^azhuo\/generated\/images\/\d{6}\/azhuo_gen_img_\d+_[a-z0-9]+\.jpg$/);

    const vidKey = buildStorageKey('generated/videos', 'mp4');
    expect(vidKey).toMatch(/^azhuo\/generated\/videos\/\d{6}\/azhuo_gen_vid_\d+_[a-z0-9]+\.mp4$/);

    // 兼容旧别名映射
    const legacyImgKey = buildStorageKey('images', 'jpg');
    expect(legacyImgKey).toMatch(/^azhuo\/generated\/images\/\d{6}\/azhuo_gen_img_\d+_[a-z0-9]+\.jpg$/);

    const legacyVidKey = buildStorageKey('videos', 'mp4');
    expect(legacyVidKey).toMatch(/^azhuo\/generated\/videos\/\d{6}\/azhuo_gen_vid_\d+_[a-z0-9]+\.mp4$/);
  });

  it('correctly builds keys for assets category', () => {
    const key = buildStorageKey('assets', 'png');
    expect(key).toMatch(/^azhuo\/assets\/\d{6}\/azhuo_asset_\d+_[a-z0-9]+\.png$/);
  });
});

describe('Storage Key Extraction & Safety Guard', () => {
  it('extracts key from virtual-hosted Aliyun OSS URL', () => {
    const url = 'https://my-bucket.oss-cn-hangzhou.aliyuncs.com/azhuo/generated/images/202609/azhuo_gen_img_123.jpg';
    expect(extractStorageKeyFromUrl(url)).toBe('azhuo/generated/images/202609/azhuo_gen_img_123.jpg');
  });

  it('extracts key from custom CDN domain URL', () => {
    const url = 'https://oss-cdn.example.com/azhuo/products/202609/azhuo_prod_456.jpg';
    expect(extractStorageKeyFromUrl(url)).toBe('azhuo/products/202609/azhuo_prod_456.jpg');
  });

  it('extracts key from path-style URL with bucketName', () => {
    const url = 'https://s3.example.com/my-bucket/azhuo/external/202609/azhuo_ext_789.jpg';
    expect(extractStorageKeyFromUrl(url, 'my-bucket')).toBe('azhuo/external/202609/azhuo_ext_789.jpg');
  });

  it('extracts key from local storage relative path', () => {
    const url = '/storage/azhuo/generated/videos/202609/azhuo_gen_vid_999.mp4';
    expect(extractStorageKeyFromUrl(url)).toBe('azhuo/generated/videos/202609/azhuo_gen_vid_999.mp4');
  });

  it('strictly rejects non-azhuo URLs to prevent accidental deletion', () => {
    expect(extractStorageKeyFromUrl('https://img.alicdn.com/imgextra/i1/123/O1CN01.jpg')).toBeNull();
    expect(extractStorageKeyFromUrl('https://my-bucket.oss-cn-hangzhou.aliyuncs.com/other-app/file.jpg')).toBeNull();
    expect(extractStorageKeyFromUrl('/storage/other-app/file.jpg')).toBeNull();
    expect(extractStorageKeyFromUrl('')).toBeNull();
  });
});

describe('Cascade Deletion', () => {
  it('safely handles empty URL array without throwing', async () => {
    const result = await deleteObjectsFromStorage([]);
    expect(result).toEqual({ deleted: 0, errors: 0 });
  });

  it('safely handles invalid or non-storage URLs', async () => {
    const result = await deleteObjectsFromStorage([
      'https://sns-img-hw.xhscdn.com/123.jpg',
      'invalid-url',
    ]);
    expect(result).toEqual({ deleted: 0, errors: 0 });
  });
});

describe('getPresignedStorageUrl', () => {
  it('generates valid presigned URL for private Aliyun OSS object', async () => {
    const { getPresignedStorageUrl } = await import('../storage');
    const customConfig = {
      enabled: true,
      provider: 'oss' as const,
      endpoint: 'https://oss-cn-beijing.aliyuncs.com',
      accessKeyId: 'TEST_KEY',
      secretAccessKey: 'TEST_SECRET',
      bucketName: 'test-bucket',
    };

    const rawUrl = 'https://test-bucket.oss-cn-beijing.aliyuncs.com/azhuo/generated/images/202609/test_img.png';
    const signed = getPresignedStorageUrl(rawUrl, 3600, customConfig);

    expect(signed).not.toBeNull();
    expect(signed).toContain('test-bucket.oss-cn-beijing.aliyuncs.com/azhuo/generated/images/202609/test_img.png');
    expect(signed).toContain('OSSAccessKeyId=TEST_KEY');
    expect(signed).toContain('Expires=');
    expect(signed).toContain('Signature=');
  });

  it('preserves URLs that already contain signatures', async () => {
    const { getPresignedStorageUrl } = await import('../storage');
    const alreadySigned = 'https://test.oss.com/img.png?OSSAccessKeyId=foo&Expires=123&Signature=bar';
    expect(getPresignedStorageUrl(alreadySigned)).toBe(alreadySigned);
  });

  it('returns null for non-storage URLs', async () => {
    const { getPresignedStorageUrl } = await import('../storage');
    expect(getPresignedStorageUrl('https://example.com/other.png')).toBeNull();
  });
});

describe('Cloud Storage Scope Restriction (AI Generated Only)', () => {
  it('suppresses upload for products, external and assets in uploadRemoteMediaToStorage', async () => {
    const { uploadRemoteMediaToStorage } = await import('../storage');
    const dummyProductUrl = 'https://img.alicdn.com/imgextra/i1/123/prod.jpg';
    const dummyExternalUrl = 'https://sns-img-hw.xhscdn.com/external.mp4';
    const dummyAssetUrl = 'https://example.com/asset.png';

    // 商品采集直接返回原始直链，无需任何配置，不向云端存储上传
    const resProd = await uploadRemoteMediaToStorage(dummyProductUrl, { category: 'products' });
    expect(resProd).toBe(dummyProductUrl);

    // 外站采集直接返回原始直链
    const resExt = await uploadRemoteMediaToStorage(dummyExternalUrl, { category: 'external' });
    expect(resExt).toBe(dummyExternalUrl);

    // 素材类直接返回原始直链
    const resAsset = await uploadRemoteMediaToStorage(dummyAssetUrl, { category: 'assets' });
    expect(resAsset).toBe(dummyAssetUrl);
  });

  it('rejects non-generated mediaType in persistMediaUrl', async () => {
    const { persistMediaUrl } = await import('../storage');
    const customConfig = {
      enabled: true,
      provider: 'oss' as const,
      endpoint: 'https://oss-cn-beijing.aliyuncs.com',
      accessKeyId: 'TEST_KEY',
      secretAccessKey: 'TEST_SECRET',
      bucketName: 'test-bucket',
    };

    // 商品采集分类禁止转存
    const resProd = await persistMediaUrl('task-1', 'https://img.alicdn.com/prod.jpg', 'products' as any, customConfig);
    expect(resProd).toBeNull();

    // 外站采集分类禁止转存
    const resExt = await persistMediaUrl('task-2', 'https://sns-img-hw.xhscdn.com/ext.jpg', 'external' as any, customConfig);
    expect(resExt).toBeNull();
  });
});


