import { normalizeCollectedImages } from '../normalizeCollectedImages';
import { useState, useRef } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { formatUserError } from '@beike/shared/upstreamErrors';
import { getExternalScraperCredentials } from '@/lib/externalScraperCredentials';
import { parseSocialLinkWithRateLimit } from '@/lib/xhsLinkBatch';
import { RateLimiter } from '@/lib/rateLimiter';
import { detectPlatformFromText } from '../collectorShared';
import { sanitizeCollectedItem } from '../collectorUrlHelpers';

interface UseSingleCollectOptions {
  showToast: (msg: string) => void;
  saveToCollectorHistory: (item: any) => void;
}

export function useSingleCollect({
  showToast,
  saveToCollectorHistory,
}: UseSingleCollectOptions) {
  const [singlePlatform, setSinglePlatform] = useState<'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social'>('auto');
  const [singleInput, setSingleInput] = useState('');
  const [isCollectingSingle, setIsCollectingSingle] = useState(false);
  const [singleCollectedResult, setSingleCollectedResult] = useState<any | null>(null);
  const [selectedSingleImages, setSelectedSingleImages] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState(false);
  const [singleImageFilter, setSingleImageFilter] = useState<'all' | 'main' | 'sku' | 'desc' | 'video'>('all');
  const [forceRefresh, setForceRefresh] = useState(false);
  const [aiAssistantPrompt, setAiAssistantPrompt] = useState('');
  const socialRateLimiterRef = useRef(new RateLimiter(8.5));

  const handleSingleCollect = async () => {
    const query = singleInput.trim();
    if (!query) {
      showToast('⚠️ 请输入商品链接、数字 ID 或小红书/抖音等社媒作品链接');
      return;
    }

    const platform = singlePlatform === 'auto' ? detectPlatformFromText(query) : singlePlatform;
    setIsCollectingSingle(true);

    try {
      if (platform === 'social') {
        const { scraperId, scraperSecret } = await getExternalScraperCredentials();
        const parsed = await parseSocialLinkWithRateLimit(
          query,
          scraperId,
          scraperSecret,
          socialRateLimiterRef.current,
        );

        if (parsed.success) {
          const result = parsed.data;
          const images = Array.isArray(result.images) ? result.images : [];

          const parsedItem = {
            id: `social_${Date.now()}`,
            type: 'social',
            title: result.title || '社媒爆款图集素材',
            description: result.description || '',
            author: result.author || '社媒达人',
            coverImage: result.cover || images[0] || '',
            images: images,
            video: result.video || null,
            sourceUrl: query,
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
          };

          const sanitized = sanitizeCollectedItem(parsedItem);
          setSingleCollectedResult(sanitized);
          setSelectedSingleImages(sanitized.images || []);
          setSelectedVideo(Boolean(sanitized.video));
          setSingleImageFilter('all');
          saveToCollectorHistory(sanitized);
          const imgN = sanitized.images?.length || 0;
          const hasVid = Boolean(sanitized.video);
          showToast(
            hasVid
              ? `🎉 成功解析${imgN > 0 ? ` ${imgN} 张图` : ''}${hasVid ? ' + 原视频' : ''}！已存入汇总库`
              : `🎉 成功解析 ${imgN} 张高清无水印社媒图集！已存入汇总库`,
          );
        } else {
          showToast(`❌ 社媒解析失败: ${parsed.error || '未能提取到图片内容'}`);
        }
      } else {
        // 电商商品采集专线 (带 30s 请求超时)
        const res = await apiFetch('/api/catalog/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({
            url: query,
            platform: platform,
            forceRefresh: forceRefresh,
          }),
        });

        const data = await res.json();
        if (data.success && data.product) {
          const prod = data.product;
          const { mainImgs, skuImgs, descImgs, allImgs, coverImg } = normalizeCollectedImages(data);

          const parsedItem = {
            id: `ecom_${prod.skuId || prod.itemId || Date.now()}`,
            type: 'ecommerce',
            platform: prod.platform || platform,
            title: prod.title || '电商精选商品素材',
            price: prod.price || 0,
            category: prod.category || '数码家电/服饰美妆',
            skuId: prod.skuId || prod.itemId || query,
            coverImage: coverImg,
            images: allImgs,
            mainImages: mainImgs,
            skuImages: skuImgs,
            descImages: descImgs,
            props: prod.props || data.images?.props || {},
            sourceUrl: query,
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
          };

          const sanitized = sanitizeCollectedItem(parsedItem);
          setSingleCollectedResult(sanitized);
          setSelectedSingleImages(sanitized.images || []);
          setSelectedVideo(false);
          setSingleImageFilter('all');
          saveToCollectorHistory(sanitized);
          showToast(`🎉 成功解析商品「${sanitized.title}」，共 ${sanitized.images.length} 张高清无水印素材！`);
        } else {
          showToast(`❌ 采集失败: ${data.error || '未能获取到商品主图'}`);
        }
      }
    } catch (err: any) {
      showToast(`❌ 采集网络异常: ${formatUserError(err, '请检查接口与网络')}`);
    } finally {
      setIsCollectingSingle(false);
    }
  };

  return {
    singlePlatform,
    setSinglePlatform,
    singleInput,
    setSingleInput,
    isCollectingSingle,
    singleCollectedResult,
    setSingleCollectedResult,
    selectedSingleImages,
    setSelectedSingleImages,
    selectedVideo,
    setSelectedVideo,
    singleImageFilter,
    setSingleImageFilter,
    forceRefresh,
    setForceRefresh,
    aiAssistantPrompt,
    setAiAssistantPrompt,
    handleSingleCollect,
  };
}
