import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { getExternalScraperCredentials } from '@client/shared/utils/externalScraperCredentials';
import {
  batchParseXhsLinks,
  parseXhsUrlsFromText,
} from '@client/shared/utils/xhsLinkBatch';
import type { DeconstructQueueApi } from './useDeconstructQueue';
import { mergeParsedQueueItems, selectFreshSourceUrls, type CollectionIssue } from './xhsSourceCheck';

export type UseXhsBatchImportOptions = {
  queueApi: DeconstructQueueApi;
  showToast: (msg: string) => void;
  onRefreshAssets: () => void;
};

export function useXhsBatchImport({ queueApi, showToast }: UseXhsBatchImportOptions) {
  const [deconstructSourceMode, setDeconstructSourceMode] = useState<'local' | 'xhs'>('xhs');
  const [xhsLinksInput, setXhsLinksInput] = useState('');
  // 采集成功后将链接编辑器收起，让图片选择成为弹窗的唯一主操作；需要追加时再显式展开。
  const [showXhsLinkInput, setShowXhsLinkInput] = useState(true);
  const [isParsingXhsLinks, setIsParsingXhsLinks] = useState(false);
  const [collectionIssues, setCollectionIssues] = useState<CollectionIssue[]>([]);
  const [xhsParseProgress, setXhsParseProgress] = useState<{
    current: number;
    total: number;
    success: number;
    skipped: number;
  } | null>(null);

  const { queue, setQueue } = queueApi;
  const queueHasItems = queue.length > 0;
  const isLocalQueue = queue.every(item => item.images.every(image => image.startsWith('/storage/') || image.startsWith('data:')));
  useEffect(() => {
    if (!queueApi.backgroundJobId || !queueHasItems) return;
    setShowXhsLinkInput(false);
    if (isLocalQueue) setDeconstructSourceMode('local');
  }, [queueApi.backgroundJobId, queueHasItems, isLocalQueue]);

  const handleBatchParseXhsLinks = useCallback(async () => {
    const rawText = xhsLinksInput.trim();
    if (!rawText) {
      showToast('请先输入或粘贴小红书笔记链接');
      return;
    }

    const candidateUrls = parseXhsUrlsFromText(rawText);
    if (candidateUrls.length === 0) {
      showToast('未识别到有效的小红书笔记链接');
      return;
    }

    setIsParsingXhsLinks(true);
    setXhsParseProgress({ current: 0, total: candidateUrls.length, success: 0, skipped: 0 });
    setCollectionIssues([]);

    try {
      const checkRes = await apiFetch('/api/catalog/assets/source-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: candidateUrls }),
      });
      const checkData = await checkRes.json().catch(() => ({}));
      if (!checkRes.ok || checkData.success === false) {
        showToast(checkData.error || '查重服务暂不可用，请稍后重试');
        return;
      }
      const { urls, issues } = selectFreshSourceUrls(Array.isArray(checkData.data) ? checkData.data : [], queue);
      setCollectionIssues(issues);
      if (urls.length === 0) {
        showToast(issues.length > 0 ? '所选链接均已在资产库或队列中' : '未采编到符合条件的图集');
        return;
      }

      const { scraperId, scraperSecret, qiyunAppId, qiyunAppKey } = await getExternalScraperCredentials();
      const { queueItems, skipped } = await batchParseXhsLinks(urls.join('\n'), scraperId, scraperSecret, {
        qiyunAppId,
        qiyunAppKey,
        onProgress: (progress) => setXhsParseProgress({
          current: progress.current,
          total: progress.total,
          success: progress.success,
          skipped: progress.skipped ?? 0,
        }),
      });

      const parseIssues = skipped.map((item) => ({
        kind: 'error' as const,
        url: item.url,
        reason: item.reason,
      }));
      setCollectionIssues([...issues, ...parseIssues]);

      if (queueItems.length > 0) {
        setQueue(mergeParsedQueueItems(queue, queueItems));
        setXhsLinksInput('');
        setShowXhsLinkInput(false);
        showToast(
          `已提取 ${queueItems.length} 套图集，请在下方选择图片后再开始智能解构${skipped.length ? `；跳过 ${skipped.length} 套` : ''}`
        );
      } else {
        showToast(`未提取到可选图片：${skipped[0]?.reason || '请检查链接或稍后重试'}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`批量采编异常: ${message}`);
    } finally {
      setIsParsingXhsLinks(false);
      setXhsParseProgress(null);
    }
  }, [xhsLinksInput, queue, setQueue, showToast]);

  return {
    deconstructSourceMode,
    setDeconstructSourceMode,
    xhsLinksInput,
    setXhsLinksInput,
    showXhsLinkInput,
    openXhsLinkInput: () => setShowXhsLinkInput(true),
    isParsingXhsLinks,
    xhsParseProgress,
    collectionIssues,
    handleBatchParseXhsLinks,
  };
}
