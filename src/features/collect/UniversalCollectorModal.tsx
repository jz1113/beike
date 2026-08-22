'use client';
import { apiFetch, proxyMediaUrl } from '@/lib/apiClient';

import React, { useState, useEffect, useRef } from 'react';
import {
  X, History, Sparkles, Loader2, FileSpreadsheet
} from 'lucide-react';
import JSZip from 'jszip';
import { saveToDownloadDir } from '@/lib/desktopDownload';
import { openExternalUrl } from '@/lib/downloadMedia';
import { useAppStore } from '@/store/useAppStore';
import { isProductImageUrl, normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import StyleExtractModal from '@/shared/modals/StyleExtractModal';
import { CollectorHubIcon } from '@/shared/ui/BrandIcons';
import {
  BatchTaskItem,
  COLLECTOR_STORAGE_KEY,
  displayMediaSrc,
  displayVideoSrc,
  handleImgError,
  isLikelyVideoUrl,
} from '@/features/collect/collectorShared';
import CollectorSinglePanel from '@/features/collect/CollectorSinglePanel';
import CollectorBatchPanel from '@/features/collect/CollectorBatchPanel';
import CollectorHistoryPanel from '@/features/collect/CollectorHistoryPanel';
import CollectorResultPanel from '@/features/collect/CollectorResultPanel';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEnterBuyerShow?: () => void;
}

export type { BatchTaskItem };

export default function UniversalCollectorModal({ isOpen, onClose, onEnterBuyerShow }: Props) {
  const {
    setProductData,
    setStep,
    setCurrentView,
    setQuickRefImage,
    setQuickPrompt,
    setIsAssistantOpen,
    setAssistantAttachments,
    setAssistantInputDraft
  } = useAppStore();

  // 当前主 Tab: single (单条极速采集) | batch (批量任务采集) | history (采集汇总专属库)
  const [activeTab, setActiveTab] = useState<'single' | 'batch' | 'history'>('single');

  // -------------------------------------------------------------
  // 1. 单条极速采集状态
  // -------------------------------------------------------------
  const [singlePlatform, setSinglePlatform] = useState<'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social'>('auto');
  const [singleInput, setSingleInput] = useState('');
  const [isCollectingSingle, setIsCollectingSingle] = useState(false);
  const [singleCollectedResult, setSingleCollectedResult] = useState<any | null>(null);
  const [selectedSingleImages, setSelectedSingleImages] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState(false);
  const [singleImageFilter, setSingleImageFilter] = useState<'all' | 'main' | 'sku' | 'desc' | 'video'>('all');
  const [forceRefresh, setForceRefresh] = useState(false);
  const [aiAssistantPrompt, setAiAssistantPrompt] = useState('');

  // -------------------------------------------------------------
  // 2. 批量任务采集状态
  // -------------------------------------------------------------
  const [batchInputMode, setBatchInputMode] = useState<'text' | 'file'>('text');
  const [batchTextarea, setBatchTextarea] = useState('');
  const [batchTasks, setBatchTasks] = useState<BatchTaskItem[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchExporting, setBatchExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchAbortedRef = useRef(false);

  // -------------------------------------------------------------
  // 3. 采集汇总库状态与多选管理
  // -------------------------------------------------------------
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'ecommerce' | 'social'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);

  // 详情查看抽屉/模态状态
  const [inspectingItem, setInspectingItem] = useState<any | null>(null);
  const [inspectingSelectedImages, setInspectingSelectedImages] = useState<string[]>([]);

  // 大图全屏查看 Lightbox 状态
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // 批量打包下载 Loading 状态
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // 风格提炼弹窗联动
  const [isStyleExtractOpen, setIsStyleExtractOpen] = useState(false);

  // Toast 提示
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2800);
  };

  // 模态框打开时仅从专属独立仓库加载
  useEffect(() => {
    if (isOpen) {
      loadHistoryAssets();
    }
  }, [isOpen]);

  // 统一数据清洗过滤函数，彻底剔除统计追踪图、UI服务图标、角标等垃圾碎片
  const sanitizeCollectedItem = (it: any) => {
    if (!it) return it;
    const isSocial = it.platform === 'social' || Boolean(it.video) || /xiaohongshu|douyin|kuaishou|weibo|bilibili/i.test(String(it.url || ''));
    const keepUrl = (u: string) => {
      if (!u) return false;
      if (isSocial) {
        // 社媒：保留 http(s) CDN 图，不过度依赖电商 isProductImageUrl
        const n = normalizeImageUrlToStandardJpg(u) || u;
        return /^https?:\/\//i.test(n) || n.startsWith('//');
      }
      return isProductImageUrl(normalizeImageUrlToStandardJpg(u) || u);
    };
    const mapImgs = (arr: any) =>
      (Array.isArray(arr) ? arr : [])
        .map((u: string) => normalizeImageUrlToStandardJpg(u) || u)
        .filter(keepUrl);

    const cleanMain = mapImgs(it.mainImages?.length ? it.mainImages : it.images);
    const cleanSkus = mapImgs(it.skuImages);
    const cleanDesc = mapImgs(it.descImages?.length ? it.descImages : it.detailImages);
    const all = Array.from(new Set([...cleanMain, ...cleanSkus, ...cleanDesc])).filter(Boolean);
    const rawCover = normalizeImageUrlToStandardJpg(it.coverImage) || cleanMain[0] || all[0] || '';
    const cover = keepUrl(rawCover) ? (normalizeImageUrlToStandardJpg(rawCover) || rawCover) : (all[0] || '');
    return {
      ...it,
      coverImage: cover,
      images: all,
      mainImages: cleanMain.length > 0 ? cleanMain : (all.length > 0 ? [all[0]] : []),
      skuImages: cleanSkus,
      descImages: cleanDesc,
      video: it.video || null,
    };
  };

  // 串行写入采集历史，避免并发 worker 读改写互踩
  const historyWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveToCollectorHistory = (newItem: any) => {
    historyWriteChainRef.current = historyWriteChainRef.current
      .then(() => {
        const cleanedItem = sanitizeCollectedItem(newItem);
        const saved = localStorage.getItem(COLLECTOR_STORAGE_KEY);
        const list: any[] = saved ? JSON.parse(saved) : [];
        const filtered = list.filter(it => it.id !== cleanedItem.id && it.title !== cleanedItem.title);
        const updated = [cleanedItem, ...filtered.map(sanitizeCollectedItem)].slice(0, 150);
        localStorage.setItem(COLLECTOR_STORAGE_KEY, JSON.stringify(updated));
        setHistoryItems(updated);
      })
      .catch((e) => {
        console.error('保存采集专属记录失败:', e);
      });
  };

  // 仅加载本采集中心采集的独立历史数据，绝不混合外部系统库
  const loadHistoryAssets = () => {
    setIsLoadingHistory(true);
    try {
      const saved = localStorage.getItem(COLLECTOR_STORAGE_KEY);
      if (saved) {
        const list = JSON.parse(saved);
        const cleaned = Array.isArray(list) ? list.map(sanitizeCollectedItem) : [];
        setHistoryItems(cleaned);
      } else {
        setHistoryItems([]);
      }
    } catch (e) {
      console.error('读取采集专属汇总库失败:', e);
      setHistoryItems([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // -------------------------------------------------------------
  // 智能平台识别算法 (URL / ID 探测)
  // -------------------------------------------------------------
  const detectPlatformFromText = (raw: string): 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social' => {
    const text = raw.toLowerCase();
    if (text.includes('jd.com') || text.includes('3.cn') || text.includes('jingdong')) return 'jd';
    if (text.includes('taobao.com') || text.includes('tmall.com') || text.includes('tb.cn')) return 'taobao';
    if (text.includes('1688.com')) return '1688';
    if (text.includes('pinduoduo.com') || text.includes('yangkeduo.com')) return 'pinduoduo';
    if (text.includes('xiaohongshu.com') || text.includes('xhslink.com') || text.includes('douyin.com') || text.includes('kuaishou.com')) return 'social';
    // 纯数字ID默认按京东或淘宝探测
    if (/^\d{8,16}$/.test(raw.trim())) return 'jd';
    return 'jd';
  };

  // -------------------------------------------------------------
  // 1. 单条极速采集执行
  // -------------------------------------------------------------
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
        // APIA 社媒解析专线
        const res = await apiFetch('/api/catalog/styles/parse-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: query })
        });
        const data = await res.json();

        if (data.success && data.data) {
          const result = data.data;
          const images = Array.isArray(result.images) ? result.images : [];
          if (result.cover && !images.includes(result.cover)) {
            images.unshift(result.cover);
          }

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
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
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
              : `🎉 成功解析 ${imgN} 张高清无水印社媒图集！已存入汇总库`
          );
        } else {
          showToast(`❌ 社媒解析失败: ${data.error || '未能提取到图片内容'}`);
        }
      } else {
        // 电商商品采集专线 (万邦 OneBound)
        const customWbKey = localStorage.getItem('wanbang_api_key') || undefined;
        const customWbSec = localStorage.getItem('wanbang_api_secret') || undefined;

        const res = await apiFetch('/api/catalog/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: query,
            platform: platform,
            forceRefresh: forceRefresh,
            customWanbangKey: customWbKey,
            customWanbangSecret: customWbSec
          })
        });

        const data = await res.json();
        if (data.success && data.product) {
          const prod = data.product;
          const mainImgs = Array.isArray(prod.mainImages) && prod.mainImages.length > 0
            ? prod.mainImages
            : (Array.isArray(prod.images) && prod.images.length > 0 ? prod.images : (data.images?.main || []));
          const skuImgs = Array.isArray(prod.skuImages) && prod.skuImages.length > 0
            ? prod.skuImages
            : (data.images?.skus || []);
          const descImgs = Array.isArray(prod.detailImages) && prod.detailImages.length > 0
            ? prod.detailImages
            : (Array.isArray(prod.descImages) && prod.descImages.length > 0 ? prod.descImages : (data.images?.details || []));
          const allImgs = Array.from(new Set([...mainImgs, ...skuImgs, ...descImgs])).filter(Boolean);
          const coverImg = prod.coverImage || prod.picUrl || mainImgs[0] || allImgs[0] || '';

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
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
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
      showToast(`❌ 采集网络异常: ${err.message || '请检查接口与网络'}`);
    } finally {
      setIsCollectingSingle(false);
    }
  };

  // -------------------------------------------------------------
  // 2. 批量任务采集逻辑 (多链接提取、表格解析、并发队列调度)
  // -------------------------------------------------------------
  const extractUrlsFromRawText = (text: string): string[] => {
    if (!text) return [];
    // 匹配所有 http/https 链接
    const urlMatches = text.match(/https?:\/\/[^\s,;"'<>()[\]]+/gi) || [];
    // 匹配独立的 8~16 位纯数字商品 ID
    const numMatches = text.match(/\b\d{8,16}\b/g) || [];

    const combined = Array.from(new Set([...urlMatches, ...numMatches]));
    return combined.map(u => u.trim()).filter(Boolean);
  };

  // 从粘贴文本添加任务
  const handleAddTasksFromText = () => {
    const urls = extractUrlsFromRawText(batchTextarea);
    if (urls.length === 0) {
      showToast('⚠️ 未从输入框中识别到有效链接或商品 ID');
      return;
    }

    const existingUrls = new Set(batchTasks.map(t => t.url));
    const newItems: BatchTaskItem[] = [];

    urls.forEach((url, idx) => {
      if (!existingUrls.has(url)) {
        const plat = detectPlatformFromText(url);
        newItems.push({
          id: `task_${Date.now()}_${idx}`,
          url,
          platform: plat,
          status: 'pending'
        });
      }
    });

    if (newItems.length === 0) {
      showToast('ℹ️ 所输入的链接均已存在于任务列表中');
      return;
    }

    setBatchTasks(prev => [...prev, ...newItems]);
    setBatchTextarea('');
    showToast(`✅ 成功添加 ${newItems.length} 个批量采集任务！`);
  };

  // 从文件 (CSV / TXT / Excel) 导入任务
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileName = file.name.toLowerCase();
      let rawText = '';

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        // 利用内置 JSZip 解压读取 sharedStrings.xml 与 sheet1.xml
        try {
          const zip = await JSZip.loadAsync(file);
          const sharedStringsFile = zip.file('xl/sharedStrings.xml');
          if (sharedStringsFile) {
            rawText = await sharedStringsFile.async('text');
          }
          // 补充扫描所有 worksheet xml
          const sheetFiles = Object.keys(zip.files).filter(k => k.startsWith('xl/worksheets/'));
          for (const sName of sheetFiles) {
            const sFile = zip.file(sName);
            if (sFile) {
              const sContent = await sFile.async('text');
              rawText += '\n' + sContent;
            }
          }
        } catch (excelErr) {
          console.warn('JSZip 解析 Excel 异常，回退为文本读取:', excelErr);
          rawText = await file.text();
        }
      } else {
        rawText = await file.text();
      }

      const urls = extractUrlsFromRawText(rawText);
      if (urls.length === 0) {
        showToast('⚠️ 未从上传的文件中扫描到商品或社媒链接');
        return;
      }

      const existingUrls = new Set(batchTasks.map(t => t.url));
      const newItems: BatchTaskItem[] = [];

      urls.forEach((url, idx) => {
        if (!existingUrls.has(url)) {
          const plat = detectPlatformFromText(url);
          newItems.push({
            id: `task_file_${Date.now()}_${idx}`,
            url,
            platform: plat,
            status: 'pending'
          });
        }
      });

      if (newItems.length === 0) {
        showToast('ℹ️ 文件中的所有链接已在任务列表中');
        return;
      }

      setBatchTasks(prev => [...prev, ...newItems]);
      showToast(`🎉 成功从文件「${file.name}」导入 ${newItems.length} 个采集任务！`);
    } catch (err: any) {
      showToast(`❌ 文件解析失败: ${err.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 🌟 下载标准批量采集表格导入模板
  const handleDownloadCsvTemplate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const csvHeader = '商品链接,商品名称,所属平台,备注说明\n';
    const csvRows = [
      'https://item.jd.com/100012043978.html,vivo iQOO Neo11 智能手机,京东,首发爆款测款',
      'https://detail.tmall.com/item.htm?id=689123456789,复古黑胶蓝牙音箱,天猫,高客单爆款',
      'https://www.xiaohongshu.com/discovery/item/66a123456789,夏季清爽背心穿搭买家秀,小红书,社媒爆款图文复刻',
      'https://detail.1688.com/offer/712345678901.html,轻奢纯白客制化机械键盘,1688,供应链原厂货源'
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvHeader + csvRows], { type: 'text/csv;charset=utf-8;' });
    void saveToDownloadDir('全渠道商品批量采集导入模板.csv', blob);
    showToast('📥 已下载「全渠道商品批量采集导入模板.csv」！可在 Excel 中直接编辑');
  };

  // 执行单条任务采集
  const executeSingleTask = async (task: BatchTaskItem): Promise<BatchTaskItem> => {
    const customWbKey = localStorage.getItem('wanbang_api_key') || undefined;
    const customWbSec = localStorage.getItem('wanbang_api_secret') || undefined;

    try {
      if (task.platform === 'social') {
        const res = await apiFetch('/api/catalog/styles/parse-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: task.url })
        });
        const data = await res.json();
        if (data.success && data.data) {
          const result = data.data;
          const images = Array.isArray(result.images) ? result.images : [];
          if (result.cover && !images.includes(result.cover)) images.unshift(result.cover);

          const historyRecord = {
            id: `social_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'social',
            title: result.title || '社媒爆款图集素材',
            description: result.description || '',
            author: result.author || '社媒作者',
            coverImage: result.cover || images[0] || '',
            images: images,
            video: result.video || null,
            sourceUrl: task.url,
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          };
          saveToCollectorHistory(historyRecord);

          return {
            ...task,
            status: 'success',
            title: result.title || '社媒爆款图集素材',
            coverImage: result.cover || images[0] || '',
            images: images,
            video: result.video || null,
            author: result.author,
            time: new Date().toLocaleTimeString()
          };
        } else {
          return {
            ...task,
            status: 'failed',
            error: data.error || '未能提取到图片内容'
          };
        }
      } else {
        const res = await apiFetch('/api/catalog/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: task.url,
            platform: task.platform,
            forceRefresh: true,
            customWanbangKey: customWbKey,
            customWanbangSecret: customWbSec
          })
        });

        const data = await res.json();
        if (data.success && data.product) {
          const prod = data.product;
          const mainImgs = Array.isArray(prod.mainImages) && prod.mainImages.length > 0
            ? prod.mainImages
            : (Array.isArray(prod.images) && prod.images.length > 0 ? prod.images : (data.images?.main || []));
          const skuImgs = Array.isArray(prod.skuImages) && prod.skuImages.length > 0
            ? prod.skuImages
            : (data.images?.skus || []);
          const descImgs = Array.isArray(prod.detailImages) && prod.detailImages.length > 0
            ? prod.detailImages
            : (Array.isArray(prod.descImages) && prod.descImages.length > 0 ? prod.descImages : (data.images?.details || []));
          const allImgs = Array.from(new Set([...mainImgs, ...skuImgs, ...descImgs])).filter(Boolean);
          const coverImg = prod.coverImage || prod.picUrl || mainImgs[0] || allImgs[0] || '';

          const historyRecord = {
            id: `ecom_${prod.skuId || prod.itemId || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'ecommerce',
            platform: prod.platform || task.platform,
            title: prod.title || '电商精选商品素材',
            price: prod.price || 0,
            skuId: prod.skuId || prod.itemId || task.url,
            coverImage: coverImg,
            images: allImgs,
            mainImages: mainImgs,
            skuImages: skuImgs,
            descImages: descImgs,
            props: prod.props || data.images?.props || {},
            sourceUrl: task.url,
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          };
          saveToCollectorHistory(historyRecord);

          return {
            ...task,
            status: 'success',
            title: prod.title || '电商精选商品素材',
            coverImage: coverImg,
            images: allImgs,
            price: prod.price,
            time: new Date().toLocaleTimeString()
          };
        } else {
          return {
            ...task,
            status: 'failed',
            error: data.error || '采集接口无响应'
          };
        }
      }
    } catch (err: any) {
      return {
        ...task,
        status: 'failed',
        error: err.message || '网络连接异常'
      };
    }
  };

  // 批量并发任务调度器 (Concurrency: 2) — ref + 互斥 claim，避免闭包过期与重复跑
  const batchTasksRef = useRef(batchTasks);
  useEffect(() => {
    batchTasksRef.current = batchTasks;
  }, [batchTasks]);
  const claimMutexRef = useRef(Promise.resolve());

  const handleStartBatchTasks = async () => {
    const pendingTasks = batchTasksRef.current.filter(
      (t) => t.status === 'pending' || t.status === 'failed'
    );
    if (pendingTasks.length === 0) {
      showToast('ℹ️ 没有待执行或失败的任务');
      return;
    }

    setIsBatchRunning(true);
    batchAbortedRef.current = false;
    showToast(`🚀 批量采集队列已启动，正在并发抓取 ${pendingTasks.length} 个任务...`);

    const CONCURRENCY = 2;

    const claimNext = (): Promise<{ id: string; task: BatchTaskItem } | null> => {
      const job = claimMutexRef.current.then(() => {
        if (batchAbortedRef.current) return null;
        const prev = batchTasksRef.current;
        const idx = prev.findIndex(
          (t) => t.status === 'pending' || t.status === 'failed'
        );
        if (idx < 0) return null;
        const task = prev[idx];
        const next = prev.map((t, i) =>
          i === idx ? { ...t, status: 'running' as const } : t
        );
        batchTasksRef.current = next;
        setBatchTasks(next);
        return { id: task.id, task: { ...task, status: 'running' as const } };
      });
      claimMutexRef.current = job.then(() => undefined).catch(() => undefined);
      return job;
    };

    const worker = async () => {
      while (!batchAbortedRef.current) {
        const claimed = await claimNext();
        if (!claimed) break;

        const updated = await executeSingleTask(claimed.task);
        setBatchTasks((prev) => {
          const next = prev.map((t) => (t.id === claimed.id ? updated : t));
          batchTasksRef.current = next;
          return next;
        });
        await new Promise((r) => setTimeout(r, 600));
      }
    };

    const workers = Array.from({ length: CONCURRENCY }).map(() => worker());
    await Promise.all(workers);

    setIsBatchRunning(false);
    if (!batchAbortedRef.current) {
      showToast('🎉 批量采集任务队列执行完毕！已自动沉淀入汇总库');
    }
  };

  // 暂停批量采集
  const handlePauseBatchTasks = () => {
    batchAbortedRef.current = true;
    setIsBatchRunning(false);
    showToast('⏸ 已暂停批量采集任务');
  };

  // -------------------------------------------------------------
  // 3. 批量打包下载程序 (调用升级版 /api/generate/export-zip)
  // -------------------------------------------------------------
  const handleBatchDownloadAllSuccessTasks = async () => {
    const successTasks = batchTasks.filter(
      (t) => t.status === 'success' && ((t.images && t.images.length > 0) || t.video)
    );
    if (successTasks.length === 0) {
      showToast('⚠️ 当前没有已采集成功的商品可供打包下载');
      return;
    }

    setBatchExporting(true);
    showToast(`📦 正在为 ${successTasks.length} 个商品建立分目录打包，请稍候...`);

    try {
      const payloadProducts = successTasks.map((t, idx) => ({
        skuId: `PROD_${idx + 1}`,
        title: t.title || `商品_${idx + 1}`,
        description: `来源链接: ${t.url}\n抓取时间: ${t.time || ''}`,
        images: t.images || [],
        video: t.video || undefined,
      }));

      const res = await apiFetch('/api/generate/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchTitle: `贝壳云图_批量采集_${new Date().toISOString().slice(0, 10)}`,
          products: payloadProducts
        })
      });

      if (!res.ok) throw new Error(`导出失败 HTTP ${res.status}`);

      const blob = await res.blob();
      await saveToDownloadDir(`全渠道批量采集成果包_${new Date().toISOString().slice(0, 10)}.zip`, blob);
      showToast('🎉 批量结构化 ZIP 压缩包已成功下载！');
    } catch (err: any) {
      showToast(`❌ 批量打包下载失败: ${err.message}`);
    } finally {
      setBatchExporting(false);
    }
  };

  // 汇总库中一键打包选中的商品
  const handleBatchDownloadSelectedHistory = async () => {
    const selectedList = historyItems.filter(it => selectedHistoryIds.includes(it.id));
    if (selectedList.length === 0) {
      showToast('⚠️ 请先在汇总库中勾选需要打包下载的商品');
      return;
    }

    setIsDownloadingZip(true);
    showToast(`📦 正在为选中的 ${selectedList.length} 个商品建立结构化打包...`);

    try {
      const payloadProducts = selectedList.map(it => ({
        skuId: it.skuId || it.id,
        title: it.title || '采集图集',
        description: it.description || `来源: ${it.sourceUrl || ''}\n作者: ${it.author || ''}`,
        images: it.images || []
      }));

      const res = await apiFetch('/api/generate/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchTitle: `贝壳云图采集汇总_批量导出_${selectedList.length}款`,
          products: payloadProducts
        })
      });

      if (!res.ok) throw new Error(`导出失败 HTTP ${res.status}`);

      const blob = await res.blob();
      await saveToDownloadDir(`贝壳云图采集汇总_批量导出_${selectedList.length}款.zip`, blob);
      showToast('🎉 选中的商品已成功全量打包下载！');
    } catch (err: any) {
      showToast(`❌ 批量打包下载失败: ${err.message}`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // 单视频快速下载 MP4
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const handleDownloadSingleVideo = async (item: any) => {
    const videoUrl = item.video || item.videoUrl;
    if (!videoUrl) {
      showToast('⚠️ 未检测到该条目的可下载视频链接');
      return;
    }

    setIsDownloadingVideo(true);
    showToast(`🎬 正在下载「${(item.title || '无水印原视频').slice(0, 15)}...」...`);

    try {
      const proxyUrl = proxyMediaUrl(videoUrl);
      let res = await apiFetch(proxyUrl);
      if (!res.ok) {
        res = await fetch(videoUrl);
      }
      if (!res.ok) throw new Error(`视频下载失败 HTTP ${res.status}`);

      const blob = await res.blob();
      await saveToDownloadDir(`${(item.title || '社媒视频').slice(0, 20).replace(/[\\/:*?"<>|]/g, '_')}_无水印原视频.mp4`, blob);
      showToast('🎉 无水印高清原视频 (MP4) 已成功下载！');
    } catch (err: any) {
      await openExternalUrl(videoUrl);
      showToast(`已在新标签页为您打开视频播放/下载地址`);
    } finally {
      setIsDownloadingVideo(false);
    }
  };

  // 单商品快速打包下载 ZIP
  const handleDownloadSingleZip = async (item: any) => {
    if ((!item.images || item.images.length === 0) && !item.video) {
      showToast('⚠️ 该条目没有可供下载的图片或视频');
      return;
    }

    setIsDownloadingZip(true);
    showToast(`📦 正在打包「${item.title.slice(0, 15)}...」的高清图集与素材...`);

    try {
      const res = await apiFetch('/api/generate/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: item.skuId || item.id,
          productTitle: item.title,
          description: item.description || `来源: ${item.sourceUrl || ''}`,
          video: item.video || null,
          images: item.images || []
        })
      });

      if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);

      const blob = await res.blob();
      await saveToDownloadDir(`${item.title.slice(0, 20).replace(/[\\/:*?"<>|]/g, '_')}_高清图集.zip`, blob);
      showToast('🎉 高清图集 ZIP 已成功下载！');
    } catch (err: any) {
      showToast(`❌ 打包下载失败: ${err.message}`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // 一键带入商用生图工坊
  const handleImportToBuyerShow = (item: any) => {
    const allImages = Array.isArray(item.images) ? item.images : [];
    const mainImages = Array.isArray(item.mainImages) && item.mainImages.length > 0 ? item.mainImages : allImages.slice(0, 5);
    const skuImages = Array.isArray(item.skuImages) ? item.skuImages : [];
    const descImages = Array.isArray(item.descImages) ? item.descImages : allImages.slice(5);

    setProductData(
      {
        title: item.title || '精选采集商品',
        price: item.price || '99.00',
        category: item.category || '数码美妆/服饰鞋包',
        skuId: item.skuId || 'COLLECTOR_SKU'
      },
      {
        main: mainImages,
        skus: skuImages,
        details: descImages
      }
    );

    setStep(1);
    setCurrentView('buyer_show');
    onClose();
    if (onEnterBuyerShow) onEnterBuyerShow();
    showToast('🚀 已成功将全套高清素材带入「商业视觉工坊」！');
  };

  // 🌟 一键带入/导入 AI 助手输入框 (支持自选素材或全量素材 + 自定义指令 + 原视频)
  const handleImportToAIAssistant = (item: any, customPrompt?: string, customImages?: string[], includeVideo?: boolean) => {
    const wantVideo = includeVideo !== undefined
      ? includeVideo
      : (selectedVideo && Boolean(item?.video));

    const hasExplicitImages = customImages && customImages.length > 0;
    const hasGridSelection = selectedSingleImages.length > 0;
    let targetImages = hasExplicitImages
      ? customImages!
      : (hasGridSelection ? selectedSingleImages : []);

    // 仅当图与视频都未显式选择时，才回退全部图片
    if (targetImages.length === 0 && !wantVideo) {
      targetImages = (Array.isArray(item?.images) && item.images.length > 0)
        ? item.images
        : (item?.coverImage ? [item.coverImage] : []);
    }

    const attachments: Array<{ type: 'image' | 'video'; url: string; thumbnailUrl?: string; name?: string }> = targetImages
      .filter(Boolean)
      .map(u => ({
        type: 'image' as const,
        url: normalizeImageUrlToStandardJpg(u) || u,
        name: item?.title ? `${String(item.title).slice(0, 15)}...` : '采集素材'
      }));

    if (wantVideo && item?.video) {
      attachments.push({
        type: 'video',
        url: item.video,
        thumbnailUrl: normalizeImageUrlToStandardJpg(item.coverImage) || item.coverImage || undefined,
        name: '原视频'
      });
    }

    if (attachments.length === 0) {
      showToast('⚠️ 请先勾选图片或原视频后再发送到助手');
      return;
    }

    setAssistantAttachments(attachments);

    const promptToSend = (customPrompt !== undefined ? customPrompt : aiAssistantPrompt).trim();
    if (promptToSend) {
      setAssistantInputDraft(promptToSend);
    } else {
      const isSocial = item?.type === 'social' || item?.platform === 'social';
      const defaultText = wantVideo
        ? `请分析附带的【${item?.title || '社媒作品'}】原视频（将基于多帧画面理解镜头运动、产品露出与氛围），并结合附图给出商业复刻分镜与文案建议。`
        : isSocial
          ? `请分析附带的这组【${item?.title || '社媒图集'}】爆款素材，拆解其人像光影、场景构图与画面氛围配方，并给出商业复刻分镜建议。`
          : `请分析附带的【${item?.title || '商品实物'}】素材，深度提炼工业材质、核心卖点与光影质感，并规划4套商业买家秀/广告分镜方案。`;
      setAssistantInputDraft(defaultText);
    }

    setIsAssistantOpen(true);
    onClose();
    const videoHint = attachments.some(a => a.type === 'video') ? '（含原视频）' : '';
    showToast(`🤖 已成功将 ${attachments.length} 项素材${videoHint}导入 AI 助手！`);
  };

  // -------------------------------------------------------------
  // 汇总库过滤与统计
  // -------------------------------------------------------------
  const filteredHistory = historyItems.filter(item => {
    if (historyFilter === 'ecommerce' && item.type !== 'ecommerce') return false;
    if (historyFilter === 'social' && item.type !== 'social') return false;
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      return (item.title && item.title.toLowerCase().includes(q)) ||
        (item.author && item.author.toLowerCase().includes(q)) ||
        (item.sourceUrl && item.sourceUrl.toLowerCase().includes(q));
    }
    return true;
  });

  const batchSuccessCount = batchTasks.filter(t => t.status === 'success').length;
  const batchFailedCount = batchTasks.filter(t => t.status === 'failed').length;
  const batchPendingCount = batchTasks.filter(t => t.status === 'pending').length;
  const batchRunningCount = batchTasks.filter(t => t.status === 'running').length;
  const batchProgressPercent = batchTasks.length > 0 ? Math.round((batchSuccessCount / batchTasks.length) * 100) : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-md animate-fade-in select-none">
      {/* 隐藏的通用文件上传输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* 模态框主体卡片 */}
      <div className="relative w-full max-w-6xl max-h-[92vh] h-[860px] rounded-[32px] bg-white border border-slate-200/90 shadow-[0_25px_70px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden text-left">

        {/* 🌟 1. 顶部 Header 导航条 (优雅微圆角分段式 Tab) */}
        <header className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between gap-4 flex-shrink-0 bg-white">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 flex-shrink-0">
              <CollectorHubIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  全渠道智能采集中心
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold font-mono">
                  Universal Collector
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                支持京东 / 淘宝 / 天猫 / 1688 / 拼多多全景素材与小红书 / 抖音社媒无水印爆款图集
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 三大主 Tab 分段控制器 */}
            <div className="p-1 rounded-2xl bg-slate-100/90 border border-slate-200/70 flex items-center gap-1 shadow-inner text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('single')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'single'
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>单条极速采集</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('batch')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 relative ${activeTab === 'batch'
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                <span>批量任务采集</span>
                {batchTasks.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-mono">
                    {batchTasks.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'history'
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
              >
                <History className="w-3.5 h-3.5 text-slate-600" />
                <span>采集汇总库 ({historyItems.length})</span>
              </button>
            </div>

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer border border-transparent hover:border-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* 🌟 2. 主内容展示区域 */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">

          {activeTab === 'single' && (
            <CollectorSinglePanel
              singlePlatform={singlePlatform}
              setSinglePlatform={setSinglePlatform}
              singleInput={singleInput}
              setSingleInput={setSingleInput}
              handleSingleCollect={handleSingleCollect}
              isCollectingSingle={isCollectingSingle}
              forceRefresh={forceRefresh}
              setForceRefresh={setForceRefresh}
              singleCollectedResult={singleCollectedResult}
              selectedSingleImages={selectedSingleImages}
              setSelectedSingleImages={setSelectedSingleImages}
              selectedVideo={selectedVideo}
              setSelectedVideo={setSelectedVideo}
              singleImageFilter={singleImageFilter}
              setSingleImageFilter={setSingleImageFilter}
              aiAssistantPrompt={aiAssistantPrompt}
              setAiAssistantPrompt={setAiAssistantPrompt}
              isDownloadingVideo={isDownloadingVideo}
              isDownloadingZip={isDownloadingZip}
              setPreviewImageUrl={setPreviewImageUrl}
              setInspectingItem={setInspectingItem}
              setIsStyleExtractOpen={setIsStyleExtractOpen}
              handleDownloadSingleVideo={handleDownloadSingleVideo}
              handleDownloadSingleZip={handleDownloadSingleZip}
              handleImportToBuyerShow={handleImportToBuyerShow}
              handleImportToAIAssistant={handleImportToAIAssistant}
              showToast={showToast}
            />
          )}

          {activeTab === 'batch' && (
            <CollectorBatchPanel
              batchInputMode={batchInputMode}
              setBatchInputMode={setBatchInputMode}
              batchTextarea={batchTextarea}
              setBatchTextarea={setBatchTextarea}
              handleAddTasksFromText={handleAddTasksFromText}
              fileInputRef={fileInputRef}
              handleDownloadCsvTemplate={handleDownloadCsvTemplate}
              batchTasks={batchTasks}
              setBatchTasks={setBatchTasks}
              isBatchRunning={isBatchRunning}
              batchExporting={batchExporting}
              batchSuccessCount={batchSuccessCount}
              batchFailedCount={batchFailedCount}
              batchPendingCount={batchPendingCount}
              batchRunningCount={batchRunningCount}
              handlePauseBatchTasks={handlePauseBatchTasks}
              handleStartBatchTasks={handleStartBatchTasks}
              handleBatchDownloadAllSuccessTasks={handleBatchDownloadAllSuccessTasks}
              handleDownloadSingleZip={handleDownloadSingleZip}
              executeSingleTask={executeSingleTask}
              setPreviewImageUrl={setPreviewImageUrl}
            />
          )}

          {activeTab === 'history' && (
            <CollectorHistoryPanel
              historyItems={historyItems}
              setHistoryItems={setHistoryItems}
              historyFilter={historyFilter}
              setHistoryFilter={setHistoryFilter}
              historySearch={historySearch}
              setHistorySearch={setHistorySearch}
              filteredHistory={filteredHistory}
              selectedHistoryIds={selectedHistoryIds}
              setSelectedHistoryIds={setSelectedHistoryIds}
              isDownloadingZip={isDownloadingZip}
              handleBatchDownloadSelectedHistory={handleBatchDownloadSelectedHistory}
              handleDownloadSingleZip={handleDownloadSingleZip}
              handleImportToAIAssistant={handleImportToAIAssistant}
              handleImportToBuyerShow={handleImportToBuyerShow}
              setInspectingItem={setInspectingItem}
              setInspectingSelectedImages={setInspectingSelectedImages}
              showToast={showToast}
            />
          )}

        </div>

        {/* 🌟 3. 底部状态指示栏 */}
        <footer className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span>全渠道采集专线已就绪 · 支持一键全网解析、多链接/表格批量导入与成套 ZIP 打包下载</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold transition-all cursor-pointer shadow-2xs"
          >
            完成并关闭
          </button>
        </footer>
      </div>

      {inspectingItem && (
        <CollectorResultPanel
          inspectingItem={inspectingItem}
          inspectingSelectedImages={inspectingSelectedImages}
          setInspectingItem={setInspectingItem}
          setPreviewImageUrl={setPreviewImageUrl}
          handleImportToAIAssistant={handleImportToAIAssistant}
          handleDownloadSingleZip={handleDownloadSingleZip}
        />
      )}

      {/* 🌟 大图灯箱预览 */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in cursor-zoom-out"
        >
          {isLikelyVideoUrl(previewImageUrl) || previewImageUrl === singleCollectedResult?.video || previewImageUrl === inspectingItem?.video ? (
            <video
              src={displayVideoSrc(previewImageUrl)}
              controls
              autoPlay
              playsInline
              className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl border border-white/20 bg-black"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={displayMediaSrc(previewImageUrl) || previewImageUrl}
              alt="高清大图预览"
              referrerPolicy="no-referrer"
              onError={(e) => handleImgError(e, previewImageUrl)}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/20"
            />
          )}
        </div>
      )}

      {/* 风格提炼弹窗联动 */}
      <StyleExtractModal
        isOpen={isStyleExtractOpen}
        onClose={() => setIsStyleExtractOpen(false)}
      />

      {/* 全局悬浮 Toast */}
      {toastMsg && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-80 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white text-xs font-semibold shadow-2xl border border-slate-700/80 backdrop-blur-md animate-fade-in flex items-center gap-2 pointer-events-none">
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
