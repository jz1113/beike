import { useState, useRef, useEffect } from 'react';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { getCollectorRateLimiter } from '../utils/collectorRateLimiter';
import { detectPlatformFromText, extractUrlsFromRawText, type BatchTaskItem } from '../utils/collectorTypes';
import { collectSourceMedia, type CollectedSourceItem } from '../utils/collectSourceMedia';

interface UseSingleCollectOptions {
  isOpen?: boolean;
  showToast: (msg: string) => void;
  saveToCollectorHistory?: (item: CollectedSourceItem) => void;
}

export function useSingleCollect({ isOpen = true, showToast, saveToCollectorHistory }: UseSingleCollectOptions) {
  const [singlePlatform, setSinglePlatform] = useState<BatchTaskItem['platform']>('auto');
  const [singleInput, setSingleInput] = useState('');
  const [isCollectingSingle, setIsCollectingSingle] = useState(false);
  const [singleCollectedResult, setSingleCollectedResult] = useState<CollectedSourceItem | null>(null);
  const [selectedSingleImages, setSelectedSingleImages] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState(false);
  const [singleImageFilter, setSingleImageFilter] = useState<'all' | 'main' | 'sku' | 'desc' | 'video'>('all');
  const [forceRefresh, setForceRefresh] = useState(false);
  const [aiAssistantPrompt, setAiAssistantPrompt] = useState('');
  const activeRequestRef = useRef<AbortController | null>(null);
  const isOpenRef = useRef(isOpen);
  const aliveRef = useRef(true);
  const submittedRef = useRef(false);
  const socialRateLimiterRef = useRef(getCollectorRateLimiter());

  useEffect(() => {
    aliveRef.current = true;
    return () => {
    aliveRef.current = false;
    isOpenRef.current = false;
    if (!submittedRef.current) activeRequestRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen && !submittedRef.current) activeRequestRef.current?.abort();
  }, [isOpen]);

  const handleSingleCollect = async () => {
    if (activeRequestRef.current || !isOpenRef.current) return;
    const candidates = extractUrlsFromRawText(singleInput.trim());
    if (candidates.length !== 1) {
      showToast(candidates.length > 1 ? '识别到多条链接或 ID，请使用批量采集' : '请输入有效的商品链接、商品 ID 或社媒作品链接');
      return;
    }
    const query = candidates[0];
    const detectedPlatform = detectPlatformFromText(query);
    if (detectedPlatform === 'auto') {
      showToast('暂不支持该链接平台，请使用京东、淘宝、1688、拼多多或支持的社媒作品链接');
      return;
    }
    const platform = singlePlatform === 'auto' ? detectedPlatform : singlePlatform;
    if (/^\d+$/.test(query) && platform === 'social') {
      showToast('社媒采集需要作品链接，请粘贴完整分享链接');
      return;
    }
    if (!/^\d+$/.test(query) && singlePlatform !== 'auto' && platform !== detectedPlatform) {
      showToast('链接与所选平台不匹配，请切换为智能识别或选择对应平台');
      return;
    }

    const request = new AbortController();
    activeRequestRef.current = request;
    submittedRef.current = false;
    setIsCollectingSingle(true);
    setSingleInput(query);
    const isCurrent = () => activeRequestRef.current === request && !request.signal.aborted && aliveRef.current;
    try {
      const result = await collectSourceMedia(query, platform, forceRefresh, socialRateLimiterRef.current, request.signal, {
        shouldStop: () => !isOpenRef.current || !aliveRef.current,
        onSubmitted: () => { submittedRef.current = true; },
      });
      if (!isCurrent()) return;
      setSingleCollectedResult(result);
      setSelectedSingleImages(result.images);
      setSelectedVideo(Boolean(result.video));
      setSingleImageFilter('all');
      setAiAssistantPrompt('');
      saveToCollectorHistory?.(result);
      if (isOpenRef.current) showToast(`已采集「${result.title}」：${result.images.length} 张图片${result.videos?.length ? ` + ${result.videos.length} 条原视频/动态` : ''}`);
    } catch (error) {
      if (isCurrent() && isOpenRef.current) showToast(`采集失败：${formatUserError(error, '请检查链接与网络')}`);
    } finally {
      if (activeRequestRef.current === request) {
        activeRequestRef.current = null;
        submittedRef.current = false;
        if (aliveRef.current) setIsCollectingSingle(false);
      }
    }
  };

  return {
    singlePlatform, setSinglePlatform, singleInput, setSingleInput, isCollectingSingle,
    singleCollectedResult, setSingleCollectedResult, selectedSingleImages, setSelectedSingleImages,
    selectedVideo, setSelectedVideo, singleImageFilter, setSingleImageFilter, forceRefresh, setForceRefresh,
    aiAssistantPrompt, setAiAssistantPrompt, handleSingleCollect,
  };
}
