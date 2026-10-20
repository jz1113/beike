import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { BatchProductItem } from '../model/batchTypes';
import { parseBatchInputLines, runBatchCollect } from '../model/collection/batchCollect';

interface BatchCollectionOptions {
  items: BatchProductItem[];
  itemsRef: MutableRefObject<BatchProductItem[]>;
  setItems: Dispatch<SetStateAction<BatchProductItem[]>>;
  batchInputText: string;
  setBatchInputText: Dispatch<SetStateAction<string>>;
  showToast: (message: string) => void;
}

export function useBatchCollection({ items, itemsRef, setItems, batchInputText, setBatchInputText, showToast }: BatchCollectionOptions) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectProgress, setCollectProgress] = useState({ total: 0, current: 0, success: 0, failed: 0 });
  const collectInFlight = useRef(false);

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleParseInput = () => {
    if (collectInFlight.current) return [];
    const { newItems: created, error } = parseBatchInputLines(
      batchInputText, new Set(itemsRef.current.map((item) => `${item.platform}:${item.itemId}`)),
    );
    if (error === 'EMPTY_INPUT') {
      showToast('请输入至少一条商品链接或 SKU');
      return [];
    }
    if (error === 'NO_NEW_ITEMS' || created.length === 0) {
      showToast('没有识别到新的不重复商品');
      return [];
    }
    const nextItems = [...itemsRef.current, ...created];
    itemsRef.current = nextItems;
    setItems(nextItems);
    setBatchInputText('');
    showToast(`成功加入 ${created.length} 个待采商品`);
    return created;
  };

  const startBatchCollect = async (itemsToCollect = items, forceRefresh = false) => {
    if (collectInFlight.current) return;
    const pendingItems = itemsToCollect.filter((item) => forceRefresh ? item.status === 'success' : item.status === 'pending' || item.status === 'failed');
    if (pendingItems.length === 0) {
      showToast('没有待采集或需要重试的商品');
      return;
    }

    if (forceRefresh && !window.confirm(`重新采集这 ${pendingItems.length} 款商品会跳过缓存，可能产生接口计费。成功后替换采集图片，已有提示词和成片保留，是否继续？`)) return;
    collectInFlight.current = true;
    setIsCollecting(true);
    setCollectProgress({ total: pendingItems.length, current: 0, success: 0, failed: 0 });

    try {
      const result = await runBatchCollect(pendingItems, {
        forceRefresh,
        onItemUpdate: (id, patch) => {
          setItems((prev) => prev.map((item) => {
            if (item.id !== id) return item;
            if (forceRefresh && patch.status === 'failed') return { ...item, status: 'success', errorMsg: `刷新失败，保留原素材：${patch.errorMsg || '采集失败'}` };
            return { ...item, ...patch };
          }));
        },
        onProgress: (progress) => setCollectProgress(progress),
        concurrency: 3,
      });
      showToast(`${forceRefresh ? '重新采集完成' : '批量采编完成'}：已就绪 ${result.success} 款${result.failed ? `，失败 ${result.failed} 款${forceRefresh ? '（保留原素材）' : ''}` : ''}`);
    } finally {
      collectInFlight.current = false;
      setIsCollecting(false);
    }
  };

  return { isCollecting, collectProgress, collectInFlight, handleRemoveItem, handleParseInput, startBatchCollect };
}
