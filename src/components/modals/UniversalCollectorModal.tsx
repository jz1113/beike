'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, DownloadCloud, ShoppingBag, Share2, History, Search, 
  Sparkles, Check, Loader2, ArrowRight, ExternalLink, Trash2, 
  Copy, Image as ImageIcon, Layers, RefreshCw, Eye, Plus, 
  ChevronRight, AlertCircle, CheckCircle2, Link2, SlidersHorizontal,
  Package, Compass, Sparkle, Globe, Download, FileText, UserCheck,
  Maximize2, Tag, ExternalLink as ExtIcon, ArrowLeft, Play, Pause,
  Upload, FileSpreadsheet, ListPlus, CheckSquare, Square, FolderDown,
  Info, ShieldCheck, Film, Video
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useAppStore } from '@/store/useAppStore';
import StyleExtractModal from './StyleExtractModal';
import { CollectorHubIcon, OneBoundLogo, ApiaLogo, JdIcon, TaobaoIcon } from '@/components/common/BrandIcons';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEnterBuyerShow?: () => void;
}

const COLLECTOR_STORAGE_KEY = 'universal_collector_exclusive_vault';

export interface BatchTaskItem {
  id: string;
  url: string;
  cleanId?: string;
  platform: 'auto' | 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social';
  platformName?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  title?: string;
  coverImage?: string;
  images?: string[];
  price?: number;
  author?: string;
  error?: string;
  time?: string;
}

export default function UniversalCollectorModal({ isOpen, onClose, onEnterBuyerShow }: Props) {
  const { 
    setProductData, 
    setStep, 
    setCurrentView,
    setQuickRefImage,
    setQuickPrompt
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
  const [singleImageFilter, setSingleImageFilter] = useState<'all' | 'main' | 'sku' | 'desc'>('all');
  const [forceRefresh, setForceRefresh] = useState(false);

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

  // 仅加载本采集中心采集的独立历史数据，绝不混合外部系统库
  const loadHistoryAssets = () => {
    setIsLoadingHistory(true);
    try {
      const saved = localStorage.getItem(COLLECTOR_STORAGE_KEY);
      if (saved) {
        const list = JSON.parse(saved);
        setHistoryItems(Array.isArray(list) ? list : []);
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

  // 独立保存一条采集记录至采集汇总库
  const saveToCollectorHistory = (newItem: any) => {
    try {
      const saved = localStorage.getItem(COLLECTOR_STORAGE_KEY);
      const list: any[] = saved ? JSON.parse(saved) : [];
      const filtered = list.filter(it => it.id !== newItem.id && it.title !== newItem.title);
      const updated = [newItem, ...filtered].slice(0, 150);
      localStorage.setItem(COLLECTOR_STORAGE_KEY, JSON.stringify(updated));
      setHistoryItems(updated);
    } catch (e) {
      console.error('保存采集专属记录失败:', e);
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
        const res = await fetch('/api/styles/parse-link', {
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

          setSingleCollectedResult(parsedItem);
          setSelectedSingleImages(images);
          saveToCollectorHistory(parsedItem);
          showToast(`🎉 成功解析 ${images.length} 张高清无水印社媒图集！已存入汇总库`);
        } else {
          showToast(`❌ 社媒解析失败: ${data.error || '未能提取到图片内容'}`);
        }
      } else {
        // 电商商品采集专线 (万邦 OneBound)
        const customWbKey = localStorage.getItem('wanbang_api_key') || undefined;
        const customWbSec = localStorage.getItem('wanbang_api_secret') || undefined;

        const res = await fetch('/api/collect', {
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
          const mainImgs = Array.isArray(prod.images) ? prod.images : [];
          const skuImgs = Array.isArray(prod.skuImages) ? prod.skuImages : [];
          const descImgs = Array.isArray(prod.descImages) ? prod.descImages : [];
          const allImgs = Array.from(new Set([...mainImgs, ...skuImgs, ...descImgs]));

          const parsedItem = {
            id: `ecom_${prod.skuId || Date.now()}`,
            type: 'ecommerce',
            platform: platform,
            title: prod.title || '电商精选商品素材',
            price: prod.price || 0,
            category: prod.category || '数码家电/服饰美妆',
            skuId: prod.skuId || query,
            coverImage: prod.coverImage || allImgs[0] || '',
            images: allImgs,
            mainImages: mainImgs,
            skuImages: skuImgs,
            descImages: descImgs,
            sourceUrl: query,
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          };

          setSingleCollectedResult(parsedItem);
          setSelectedSingleImages(allImgs);
          saveToCollectorHistory(parsedItem);
          showToast(`🎉 成功解析商品「${parsedItem.title.slice(0, 18)}...」，共 ${allImgs.length} 张高清素材！`);
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
    saveAs(blob, '全渠道商品批量采集导入模板.csv');
    showToast('📥 已下载「全渠道商品批量采集导入模板.csv」！可在 Excel 中直接编辑');
  };

  // 执行单条任务采集
  const executeSingleTask = async (task: BatchTaskItem): Promise<BatchTaskItem> => {
    const customWbKey = localStorage.getItem('wanbang_api_key') || undefined;
    const customWbSec = localStorage.getItem('wanbang_api_secret') || undefined;

    try {
      if (task.platform === 'social') {
        const res = await fetch('/api/styles/parse-link', {
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
        const res = await fetch('/api/collect', {
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
          const mainImgs = Array.isArray(prod.images) ? prod.images : [];
          const skuImgs = Array.isArray(prod.skuImages) ? prod.skuImages : [];
          const descImgs = Array.isArray(prod.descImages) ? prod.descImages : [];
          const allImgs = Array.from(new Set([...mainImgs, ...skuImgs, ...descImgs]));

          const historyRecord = {
            id: `ecom_${prod.skuId || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'ecommerce',
            platform: task.platform,
            title: prod.title || '电商精选商品素材',
            price: prod.price || 0,
            skuId: prod.skuId || task.url,
            coverImage: prod.coverImage || allImgs[0] || '',
            images: allImgs,
            mainImages: mainImgs,
            skuImages: skuImgs,
            descImages: descImgs,
            sourceUrl: task.url,
            time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          };
          saveToCollectorHistory(historyRecord);

          return {
            ...task,
            status: 'success',
            title: prod.title || '电商精选商品素材',
            coverImage: prod.coverImage || allImgs[0] || '',
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

  // 批量并发任务调度器 (Concurrency: 2)
  const handleStartBatchTasks = async () => {
    const pendingTasks = batchTasks.filter(t => t.status === 'pending' || t.status === 'failed');
    if (pendingTasks.length === 0) {
      showToast('ℹ️ 没有待执行或失败的任务');
      return;
    }

    setIsBatchRunning(true);
    batchAbortedRef.current = false;
    showToast(`🚀 批量采集队列已启动，正在并发抓取 ${pendingTasks.length} 个任务...`);

    const CONCURRENCY = 2;
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < batchTasks.length && !batchAbortedRef.current) {
        const taskIdx = currentIndex++;
        const currentTask = batchTasks[taskIdx];

        if (!currentTask || currentTask.status === 'success') continue;

        // 标记为 running
        setBatchTasks(prev => prev.map((t, idx) => idx === taskIdx ? { ...t, status: 'running' } : t));

        const updated = await executeSingleTask(currentTask);

        // 回写状态
        setBatchTasks(prev => prev.map((t, idx) => idx === taskIdx ? updated : t));

        // 优雅微延迟，防止频率触发限流
        await new Promise(r => setTimeout(r, 600));
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
  // 3. 批量打包下载程序 (调用升级版 /api/export-zip)
  // -------------------------------------------------------------
  const handleBatchDownloadAllSuccessTasks = async () => {
    const successTasks = batchTasks.filter(t => t.status === 'success' && t.images && t.images.length > 0);
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
        images: t.images || []
      }));

      const res = await fetch('/api/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchTitle: `贝壳云图_批量采集_${new Date().toISOString().slice(0, 10)}`,
          products: payloadProducts
        })
      });

      if (!res.ok) throw new Error(`导出失败 HTTP ${res.status}`);

      const blob = await res.blob();
      saveAs(blob, `全渠道批量采集成果包_${new Date().toISOString().slice(0, 10)}.zip`);
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

      const res = await fetch('/api/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchTitle: `贝壳云图采集汇总_批量导出_${selectedList.length}款`,
          products: payloadProducts
        })
      });

      if (!res.ok) throw new Error(`导出失败 HTTP ${res.status}`);

      const blob = await res.blob();
      saveAs(blob, `贝壳云图采集汇总_批量导出_${selectedList.length}款.zip`);
      showToast('🎉 选中的商品已成功全量打包下载！');
    } catch (err: any) {
      showToast(`❌ 批量打包下载失败: ${err.message}`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // 单商品快速打包下载 ZIP
  const handleDownloadSingleZip = async (item: any) => {
    if (!item.images || item.images.length === 0) {
      showToast('⚠️ 该条目没有可供下载的图片');
      return;
    }

    setIsDownloadingZip(true);
    showToast(`📦 正在打包「${item.title.slice(0, 15)}...」的高清图集...`);

    try {
      const res = await fetch('/api/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: item.skuId || item.id,
          productTitle: item.title,
          description: item.description || `来源: ${item.sourceUrl || ''}`,
          images: item.images
        })
      });

      if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);

      const blob = await res.blob();
      saveAs(blob, `${item.title.slice(0, 20).replace(/[\\/:*?"<>|]/g, '_')}_高清图集.zip`);
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
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'single'
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
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 relative ${
                  activeTab === 'batch'
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
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'history'
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

          {/* ========================================================= */}
          {/* TAB 1: 单条极速采集 */}
          {/* ========================================================= */}
          {activeTab === 'single' && (
            <div className="max-w-5xl mx-auto space-y-5">
              {/* 输入控制卡片 */}
              <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* 平台选择胶囊群 */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                    <span className="text-slate-400 mr-1 text-xs">选择专线:</span>
                    {[
                      { id: 'auto', name: '🤖 智能自动识别', color: 'text-blue-700 bg-blue-50 border-blue-200' },
                      { id: 'jd', name: '🔴 京东 (JD)', color: 'text-red-700 bg-red-50 border-red-200' },
                      { id: 'taobao', name: '🟠 淘宝 / 天猫', color: 'text-orange-700 bg-orange-50 border-orange-200' },
                      { id: '1688', name: '🟡 1688 批发', color: 'text-amber-800 bg-amber-50 border-amber-200' },
                      { id: 'pinduoduo', name: '🔴 拼多多 (PDD)', color: 'text-rose-700 bg-rose-50 border-rose-200' },
                      { id: 'social', name: '📕 小红书/抖音/快手', color: 'text-pink-700 bg-pink-50 border-pink-200' }
                    ].map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSinglePlatform(p.id as any)}
                        className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer text-xs ${
                          singlePlatform === p.id 
                            ? `${p.color} font-bold shadow-2xs` 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>

                  {/* 强制刷新选项 */}
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={forceRefresh}
                      onChange={(e) => setForceRefresh(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span>强制穿透刷新缓存</span>
                  </label>
                </div>

                {/* 核心输入框与操作按钮 */}
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 relative flex items-center">
                    <Link2 className="w-4 h-4 text-slate-400 absolute left-4 pointer-events-none" />
                    <input
                      type="text"
                      value={singleInput}
                      onChange={(e) => setSingleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSingleCollect();
                      }}
                      placeholder="粘贴商品详情链接（如 https://item.jd.com/... 或淘宝/1688）或小红书/抖音/快手作品链接..."
                      className="w-full pl-11 pr-24 py-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                    />
                    {singleInput && (
                      <button
                        type="button"
                        onClick={() => setSingleInput('')}
                        className="absolute right-12 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                        title="清空输入"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const text = await navigator.clipboard.readText();
                          if (text) setSingleInput(text.trim());
                        } catch {
                          showToast('⚠️ 无法读取剪贴板，请手动粘贴');
                        }
                      }}
                      className="absolute right-3 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 font-medium cursor-pointer shadow-2xs"
                    >
                      粘贴
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSingleCollect}
                    disabled={isCollectingSingle || !singleInput.trim()}
                    className={`h-12 px-6 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all cursor-pointer flex-shrink-0 select-none ${
                      isCollectingSingle || !singleInput.trim()
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-md shadow-blue-500/25'
                    }`}
                  >
                    {isCollectingSingle ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>正在解析穿透...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>一键采集商品</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 采集结果展示卡片 */}
              {singleCollectedResult ? (
                <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-5 animate-fade-in">
                  {/* 顶部商品基本信息 */}
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-start gap-4 min-w-0">
                      {singleCollectedResult.coverImage && (
                        <img 
                          src={singleCollectedResult.coverImage} 
                          alt="" 
                          className="w-18 h-18 rounded-2xl object-cover border border-slate-200/80 shadow-2xs flex-shrink-0 bg-slate-50 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setPreviewImageUrl(singleCollectedResult.coverImage)}
                        />
                      )}
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold font-mono">
                            {singleCollectedResult.type === 'social' ? '社媒图集' : (singleCollectedResult.platform?.toUpperCase() || '电商')}
                          </span>
                          <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate max-w-xl">
                            {singleCollectedResult.title}
                          </h2>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          {singleCollectedResult.price > 0 && (
                            <span className="font-mono text-base font-black text-rose-600">
                              ¥{singleCollectedResult.price}
                            </span>
                          )}
                          {singleCollectedResult.author && (
                            <span>作者: <strong className="text-slate-700">{singleCollectedResult.author}</strong></span>
                          )}
                          <span>素材总数: <strong className="text-slate-900 font-mono">{singleCollectedResult.images?.length || 0}</strong> 张</span>
                        </div>
                      </div>
                    </div>

                    {/* 快捷操作群 */}
                    <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleDownloadSingleZip(singleCollectedResult)}
                        disabled={isDownloadingZip}
                        className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-600" />
                        <span>下载 ZIP 图集</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setInspectingItem(singleCollectedResult);
                          setIsStyleExtractOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                      >
                        <Compass className="w-3.5 h-3.5 text-purple-600" />
                        <span>提炼视觉风格</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleImportToBuyerShow(singleCollectedResult)}
                        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>带入商用工坊</span>
                      </button>
                    </div>
                  </div>

                  {/* 图集分类切换与全选控制 */}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setSingleImageFilter('all')}
                        className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                          singleImageFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        全部素材 ({singleCollectedResult.images?.length || 0})
                      </button>
                      {singleCollectedResult.mainImages?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSingleImageFilter('main')}
                          className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                            singleImageFilter === 'main' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          商品主图 ({singleCollectedResult.mainImages.length})
                        </button>
                      )}
                      {singleCollectedResult.skuImages?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSingleImageFilter('sku')}
                          className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                            singleImageFilter === 'sku' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          SKU 规格图 ({singleCollectedResult.skuImages.length})
                        </button>
                      )}
                      {singleCollectedResult.descImages?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSingleImageFilter('desc')}
                          className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                            singleImageFilter === 'desc' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          详情长图 ({singleCollectedResult.descImages.length})
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-slate-500">
                      <span>已选 <strong>{selectedSingleImages.length}</strong> 张</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedSingleImages.length === singleCollectedResult.images.length) {
                            setSelectedSingleImages([]);
                          } else {
                            setSelectedSingleImages(singleCollectedResult.images || []);
                          }
                        }}
                        className="text-blue-600 hover:underline font-semibold cursor-pointer"
                      >
                        {selectedSingleImages.length === singleCollectedResult.images.length ? '取消全选' : '全选'}
                      </button>
                    </div>
                  </div>

                  {/* 缩略图矩阵网格 */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-96 overflow-y-auto pr-1">
                    {(singleImageFilter === 'main' 
                        ? singleCollectedResult.mainImages 
                        : singleImageFilter === 'sku' 
                          ? singleCollectedResult.skuImages 
                          : singleImageFilter === 'desc' 
                            ? singleCollectedResult.descImages 
                            : singleCollectedResult.images
                    )?.map((imgUrl: string, idx: number) => {
                      const isSelected = selectedSingleImages.includes(imgUrl);
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSingleImages(prev => prev.filter(u => u !== imgUrl));
                            } else {
                              setSelectedSingleImages(prev => [...prev, imgUrl]);
                            }
                          }}
                          className={`group relative aspect-square rounded-2xl overflow-hidden border cursor-pointer transition-all bg-slate-100 ${
                            isSelected 
                              ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-xs' 
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <img 
                            src={imgUrl} 
                            alt="" 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div className={`absolute top-2 left-2 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-black/40 text-white/70 backdrop-blur-xs opacity-0 group-hover:opacity-100'
                          }`}>
                            {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewImageUrl(imgUrl);
                            }}
                            className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/50 hover:bg-black/75 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            title="查看大图"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* 空状态引导 */
                <div className="p-12 rounded-3xl bg-white border border-dashed border-slate-200/90 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ShoppingBag className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">尚未采集电商或社媒商品</h3>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                    支持粘贴京东、淘宝、天猫、1688、拼多多等全网主流平台的商品链接或数字 ID，以及小红书笔记/抖音视频作品，一键穿透提取全量主图、SKU 图与详情高清素材。
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: 批量任务采集 (NEW! 支持多行粘贴、表格导入与并发打包) */}
          {/* ========================================================= */}
          {activeTab === 'batch' && (
            <div className="max-w-5xl mx-auto space-y-5">
              {/* 导入与配置面板 */}
              <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBatchInputMode('text')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        batchInputMode === 'text'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                      <span>多链接批量粘贴</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setBatchInputMode('file')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        batchInputMode === 'file'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>表格 / 文件批量导入</span>
                    </button>
                  </div>

                  <span className="text-xs text-slate-400">
                    支持 .csv / .xlsx / .txt / 多行粘贴，自动去重与平台识别
                  </span>
                </div>

                {/* 模式 A：多链接文本框粘贴 */}
                {batchInputMode === 'text' ? (
                  <div className="space-y-3">
                    <textarea
                      rows={4}
                      value={batchTextarea}
                      onChange={(e) => setBatchTextarea(e.target.value)}
                      placeholder={`在此批量粘贴多行链接或商品 ID（支持回车换行或逗号分隔，一次可贴 10~50+ 条）：\nhttps://item.jd.com/1000123456.html\nhttps://detail.tmall.com/item.htm?id=68888888\nhttps://www.xiaohongshu.com/discovery/item/66a12b...`}
                      className="w-full p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all shadow-inner resize-y"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        提示：系统将智能嗅探每一行的 URL 和纯数字 ID，无需手动去除多余汉字
                      </span>
                      <button
                        type="button"
                        onClick={handleAddTasksFromText}
                        disabled={!batchTextarea.trim()}
                        className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          !batchTextarea.trim()
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>解析并加入任务队列</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 模式 B：文件拖拽上传 */
                  <div className="space-y-3">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="p-6 sm:p-7 rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/60 hover:bg-blue-50/30 flex flex-col items-center justify-center text-center cursor-pointer transition-all space-y-2.5 group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-blue-600 group-hover:scale-105 transition-transform">
                        <FileSpreadsheet className="w-6 h-6" />
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-slate-800">
                        点击或拖拽上传表格文件 (.xlsx / .csv / .txt)
                      </div>
                      <p className="text-[11px] text-slate-400 max-w-lg leading-relaxed">
                        系统将自动扫描并提取表格中包含的所有商品链接列或社媒 URL
                      </p>

                      {/* 🌟 表头说明与格式展示 (清晰展示表格表头与下载模板) */}
                      <div 
                        onClick={e => e.stopPropagation()} 
                        className="mt-2 w-full max-w-xl p-3.5 rounded-xl bg-white/95 border border-slate-200/90 shadow-2xs text-left cursor-default space-y-2.5"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5 text-blue-600" />
                            <span>推荐表格列名 (表头规范)：</span>
                          </span>
                          <button
                            type="button"
                            onClick={handleDownloadCsvTemplate}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="点击下载标准 CSV 表格模板"
                          >
                            <Download className="w-3 h-3" />
                            <span>📥 下载标准表格模板 (.csv)</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10.5px]">
                          <div className="p-2 rounded-lg bg-blue-50/70 border border-blue-100/90 text-blue-950">
                            <div className="font-bold flex items-center gap-1">
                              <span>商品链接</span>
                              <span className="text-[9px] px-1 rounded bg-blue-200 text-blue-800 font-sans">必填</span>
                            </div>
                            <div className="text-[9.5px] text-blue-600/90 truncate mt-0.5">支持各平台URL/ID</div>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-slate-800">
                            <div className="font-bold flex items-center gap-1">
                              <span>商品名称</span>
                              <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-600 font-sans">选填</span>
                            </div>
                            <div className="text-[9.5px] text-slate-400 truncate mt-0.5">如：手机/服饰</div>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-slate-800">
                            <div className="font-bold flex items-center gap-1">
                              <span>所属平台</span>
                              <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-600 font-sans">选填</span>
                            </div>
                            <div className="text-[9.5px] text-slate-400 truncate mt-0.5">京东/淘宝/小红书</div>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-slate-800">
                            <div className="font-bold flex items-center gap-1">
                              <span>备注说明</span>
                              <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-600 font-sans">选填</span>
                            </div>
                            <div className="text-[9.5px] text-slate-400 truncate mt-0.5">自定义标记/分类</div>
                          </div>
                        </div>

                        <div className="text-[10.5px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                          💡 <span className="font-semibold text-slate-700">智能嗅探无强限制：</span>表格无论包含多少列、表头命名为何（如 <code className="text-blue-700 bg-blue-50 px-1 rounded">URL</code> / <code className="text-blue-700 bg-blue-50 px-1 rounded">链接</code> / <code className="text-blue-700 bg-blue-50 px-1 rounded">Link</code> / <code className="text-blue-700 bg-blue-50 px-1 rounded">商品地址</code>），只要单元格内含有商品网址或纯 ID，系统均能 100% 自动识别、去重并批量加入任务队列。
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 任务队列状态看板 */}
              {batchTasks.length > 0 && (
                <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4 animate-fade-in">
                  {/* 进度与控制头部 */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">批量任务队列</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                          共 {batchTasks.length} 个任务
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono">
                        <span className="text-emerald-600 font-bold">✅ 成功: {batchSuccessCount}</span>
                        <span className="text-rose-600 font-bold">❌ 失败: {batchFailedCount}</span>
                        <span className="text-amber-600 font-bold">⏳ 待处理: {batchPendingCount}</span>
                        {batchRunningCount > 0 && <span className="text-blue-600 font-bold animate-pulse">⚡ 进行中: {batchRunningCount}</span>}
                      </div>
                    </div>

                    {/* 控制按钮组 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isBatchRunning ? (
                        <button
                          type="button"
                          onClick={handlePauseBatchTasks}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>暂停采集</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleStartBatchTasks}
                          disabled={batchPendingCount === 0 && batchFailedCount === 0}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            batchPendingCount === 0 && batchFailedCount === 0
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{batchFailedCount > 0 && batchPendingCount === 0 ? '重试失败项' : '全部开始采集'}</span>
                        </button>
                      )}

                      {/* 🌟 一键批量打包下载所有成功商品为 ZIP */}
                      <button
                        type="button"
                        onClick={handleBatchDownloadAllSuccessTasks}
                        disabled={batchSuccessCount === 0 || batchExporting}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                          batchSuccessCount === 0 || batchExporting
                            ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                        }`}
                        title="将所有成功采集的商品按文件夹结构打包为一个总 ZIP 文件"
                      >
                        {batchExporting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>正在打包下载...</span>
                          </>
                        ) : (
                          <>
                            <FolderDown className="w-3.5 h-3.5" />
                            <span>一键批量打包下载 ({batchSuccessCount}款)</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('确定要清空当前批量任务列表吗？')) {
                            setBatchTasks([]);
                          }
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                        title="清空队列"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 进度条 */}
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${(batchSuccessCount / batchTasks.length) * 100}%` }}
                    />
                    <div 
                      className="h-full bg-rose-500 transition-all duration-300"
                      style={{ width: `${(batchFailedCount / batchTasks.length) * 100}%` }}
                    />
                    <div 
                      className="h-full bg-blue-500 animate-pulse transition-all duration-300"
                      style={{ width: `${(batchRunningCount / batchTasks.length) * 100}%` }}
                    />
                  </div>

                  {/* 任务列表详情 */}
                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
                    {batchTasks.map((task, idx) => (
                      <div key={task.id} className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-5 text-slate-400 font-mono text-center flex-shrink-0">{idx + 1}</span>
                          
                          {/* 封面或平台图标 */}
                          {task.coverImage ? (
                            <img 
                              src={task.coverImage} 
                              alt="" 
                              className="w-9 h-9 rounded-xl object-cover border border-slate-200 flex-shrink-0 cursor-pointer"
                              onClick={() => setPreviewImageUrl(task.coverImage!)}
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 uppercase flex-shrink-0 text-[10px]">
                              {task.platform}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 truncate max-w-sm">
                                {task.title || task.url}
                              </span>
                              {task.images && (
                                <span className="px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-700 text-[10px] font-mono font-bold">
                                  {task.images.length} 张图
                                </span>
                              )}
                            </div>
                            {task.error && (
                              <p className="text-[11px] text-rose-600 truncate mt-0.5">
                                失败原因: {task.error}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* 状态徽标与单项操作 */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {task.status === 'pending' && (
                            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                              等待中
                            </span>
                          )}
                          {task.status === 'running' && (
                            <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>采集解析中...</span>
                            </span>
                          )}
                          {task.status === 'success' && (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>采集成功</span>
                            </span>
                          )}
                          {task.status === 'failed' && (
                            <button
                              type="button"
                              onClick={async () => {
                                setBatchTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'running' } : t));
                                const updated = await executeSingleTask(task);
                                setBatchTasks(prev => prev.map(t => t.id === task.id ? updated : t));
                              }}
                              className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 hover:bg-rose-100 transition-colors cursor-pointer"
                              title="点击重新采集此项"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>重试</span>
                            </button>
                          )}

                          {/* 单独打包下载 */}
                          {task.status === 'success' && task.images && task.images.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleDownloadSingleZip(task)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
                              title="单独下载该商品 ZIP"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* 移除 */}
                          <button
                            type="button"
                            onClick={() => setBatchTasks(prev => prev.filter(t => t.id !== task.id))}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: 采集专属汇总库 */}
          {/* ========================================================= */}
          {activeTab === 'history' && (
            <div className="max-w-5xl mx-auto space-y-5">
              {/* 搜索、筛选与批量打包操作条 */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 分类筛选 */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('all')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                        historyFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      全部 ({historyItems.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('ecommerce')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                        historyFilter === 'ecommerce' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      电商商品 ({historyItems.filter(i => i.type === 'ecommerce').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('social')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                        historyFilter === 'social' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      社媒图集 ({historyItems.filter(i => i.type === 'social').length})
                    </button>
                  </div>

                  {/* 搜索框 */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="搜索商品或作者..."
                      className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white"
                    />
                  </div>
                </div>

                {/* 批量操作控制 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedHistoryIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleBatchDownloadSelectedHistory}
                      disabled={isDownloadingZip}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      {isDownloadingZip ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FolderDown className="w-3.5 h-3.5" />
                      )}
                      <span>批量打包下载选中 ({selectedHistoryIds.length}款)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedHistoryIds.length === filteredHistory.length) {
                        setSelectedHistoryIds([]);
                      } else {
                        setSelectedHistoryIds(filteredHistory.map(i => i.id));
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium cursor-pointer shadow-2xs"
                  >
                    {selectedHistoryIds.length === filteredHistory.length ? '取消全选' : '全选'}
                  </button>

                  {selectedHistoryIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`确定要从汇总库删除选中的 ${selectedHistoryIds.length} 条记录吗？`)) {
                          const updated = historyItems.filter(it => !selectedHistoryIds.includes(it.id));
                          localStorage.setItem(COLLECTOR_STORAGE_KEY, JSON.stringify(updated));
                          setHistoryItems(updated);
                          setSelectedHistoryIds([]);
                          showToast('🗑 已批量删除选中的记录');
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 font-medium cursor-pointer"
                    >
                      批量删除
                    </button>
                  )}
                </div>
              </div>

              {/* 汇总库卡片网格 */}
              {filteredHistory.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white border border-dashed border-slate-200 text-center space-y-2">
                  <History className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-400">暂无符合条件的采集记录</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredHistory.map((item) => {
                    const isSelected = selectedHistoryIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`group relative rounded-2xl bg-white border p-3.5 transition-all space-y-3 ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                            : 'border-slate-200/90 hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        {/* 顶部多选框与平台标签 */}
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedHistoryIds(prev => prev.filter(id => id !== item.id));
                              } else {
                                setSelectedHistoryIds(prev => [...prev, item.id]);
                              }
                            }}
                            className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all cursor-pointer ${
                              isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white hover:border-slate-400'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </button>

                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold font-mono">
                            {item.type === 'social' ? '社媒图集' : (item.platform?.toUpperCase() || '电商')}
                          </span>
                        </div>

                        {/* 封面与信息 */}
                        <div 
                          onClick={() => {
                            setInspectingItem(item);
                            setInspectingSelectedImages(item.images || []);
                          }}
                          className="flex items-start gap-3 cursor-pointer"
                        >
                          <img 
                            src={item.coverImage || item.images?.[0]} 
                            alt="" 
                            className="w-16 h-16 rounded-xl object-cover border border-slate-200 flex-shrink-0 bg-slate-50 group-hover:opacity-90 transition-opacity"
                          />
                          <div className="space-y-1 min-w-0 flex-1">
                            <h3 className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug">
                              {item.title}
                            </h3>
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>{item.images?.length || 0} 张素材</span>
                              <span>{item.time?.slice(0, 10)}</span>
                            </div>
                          </div>
                        </div>

                        {/* 底部操作快捷按钮 */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleZip(item)}
                            className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium flex items-center gap-1 cursor-pointer"
                            title="下载 ZIP"
                          >
                            <Download className="w-3 h-3 text-blue-600" />
                            <span>ZIP</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleImportToBuyerShow(item)}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-black text-white font-medium flex items-center gap-1 cursor-pointer"
                            title="带入工坊"
                          >
                            <Sparkles className="w-3 h-3 text-amber-300" />
                            <span>工坊</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('确定要删除此采集条目吗？')) {
                                const updated = historyItems.filter(it => it.id !== item.id);
                                localStorage.setItem(COLLECTOR_STORAGE_KEY, JSON.stringify(updated));
                                setHistoryItems(updated);
                                showToast('🗑 已从汇总库删除');
                              }
                            }}
                            className="p-1 text-slate-300 hover:text-red-600 transition-colors cursor-pointer"
                            title="删除条目"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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

      {/* 🌟 详情全屏查看抽屉 (当点击卡片查看全量图集时) */}
      {inspectingItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in select-none">
          <div className="relative w-full max-w-4xl max-h-[85vh] rounded-3xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden text-left p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <img 
                  src={inspectingItem.coverImage || inspectingItem.images?.[0]} 
                  alt="" 
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                />
                <div>
                  <h3 className="font-bold text-base text-slate-900 truncate max-w-md">{inspectingItem.title}</h3>
                  <p className="text-xs text-slate-400">共 {inspectingItem.images?.length || 0} 张高清素材</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSingleZip(inspectingItem)}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载整套 ZIP</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectingItem(null)}
                  className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 overflow-y-auto max-h-[60vh] pr-1">
              {inspectingItem.images?.map((u: string, idx: number) => (
                <div 
                  key={idx} 
                  onClick={() => setPreviewImageUrl(u)}
                  className="group relative aspect-square rounded-2xl overflow-hidden border border-slate-200 hover:border-blue-400 cursor-pointer transition-all bg-slate-100"
                >
                  <img src={u} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                    <Maximize2 className="w-5 h-5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 🌟 大图灯箱预览 */}
      {previewImageUrl && (
        <div 
          onClick={() => setPreviewImageUrl(null)}
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in cursor-zoom-out"
        >
          <img 
            src={previewImageUrl} 
            alt="高清大图预览" 
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/20"
          />
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
