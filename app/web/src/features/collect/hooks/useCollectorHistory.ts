import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { COLLECTOR_STORAGE_KEY } from '../collectorShared';
import { sanitizeCollectedItem } from '../collectorUrlHelpers';

export function useCollectorHistory(isOpen: boolean) {
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'ecommerce' | 'social'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);

  // 仅加载本采集中心采集的独立历史数据
  const loadHistoryAssets = useCallback(() => {
    try {
      const saved = localStorage.getItem(COLLECTOR_STORAGE_KEY);
      if (saved) {
        const list = JSON.parse(saved);
        const cleaned = Array.isArray(list) ? list.map(sanitizeCollectedItem) : [];
        setHistoryItems(cleaned);
        // 自动将修复后的链接持久化回 localStorage
        try {
          const reSerialized = JSON.stringify(cleaned);
          if (reSerialized !== saved) {
            localStorage.setItem(COLLECTOR_STORAGE_KEY, reSerialized);
          }
        } catch {}
      } else {
        setHistoryItems([]);
      }
    } catch (e) {
      console.error('读取采集专属汇总库失败:', e);
      setHistoryItems([]);
    }
  }, []);

  // 模态框打开时从专属独立仓库加载
  useEffect(() => {
    if (isOpen) {
      loadHistoryAssets();
    }
  }, [isOpen, loadHistoryAssets]);

  // 串行写入采集历史，避免并发 worker 读改写互踩
  const historyWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveToCollectorHistory = useCallback((newItem: any) => {
    historyWriteChainRef.current = historyWriteChainRef.current
      .then(() => {
        const cleanedItem = sanitizeCollectedItem(newItem);
        const saved = localStorage.getItem(COLLECTOR_STORAGE_KEY);
        const list: any[] = saved ? JSON.parse(saved) : [];
        const filtered = list.filter((it) => it.id !== cleanedItem.id && it.title !== cleanedItem.title);
        const updated = [cleanedItem, ...filtered.map(sanitizeCollectedItem)].slice(0, 150);
        localStorage.setItem(COLLECTOR_STORAGE_KEY, JSON.stringify(updated));
        setHistoryItems(updated);
      })
      .catch((e) => {
        console.error('保存采集专属记录失败:', e);
      });
  }, []);

  const filteredHistory = useMemo(() => {
    return historyItems.filter((item) => {
      if (historyFilter === 'ecommerce' && item.type !== 'ecommerce') return false;
      if (historyFilter === 'social' && item.type !== 'social') return false;
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        return (
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.author && item.author.toLowerCase().includes(q)) ||
          (item.sourceUrl && item.sourceUrl.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [historyItems, historyFilter, historySearch]);

  return {
    historyItems,
    setHistoryItems,
    historyFilter,
    setHistoryFilter,
    historySearch,
    setHistorySearch,
    selectedHistoryIds,
    setSelectedHistoryIds,
    loadHistoryAssets,
    saveToCollectorHistory,
    filteredHistory,
  };
}
