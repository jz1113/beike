'use client';
import { apiFetch } from '@/lib/apiClient';
import { confirmAction } from '@/lib/confirmAction';
import { clearFailedTasksFromServer } from '@/lib/deleteTasks';
import {
  filterDbTasksAfterDelete,
  filterDbTasksFromTombstones,
  permanentDeleteGeneration,
} from '@/lib/permanentDeleteGeneration';
import { saveToDownloadDir } from '@/lib/desktopDownload';
import { formatUserError } from '@/lib/upstreamErrors';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Trash2,
  Download,
  CheckSquare,
  Square,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { isGenerationDeleted } from '@/store/persist';
import StyleExtractModal from '@/shared/modals/StyleExtractModal';
import { getAspectRatioFromSize } from '@/lib/drawing';
import CategoryManagerModal from '@/shared/modals/CategoryManagerModal';
import { getMergedCategories, DEFAULT_CATEGORIES, CategoryItem } from '@/lib/vision';
import { groupTasksIntoBatches, type AssetTaskBatch } from './assetBatchUtils';
import AssetProductLibrary from './AssetProductLibrary';
import AssetRecipeLibrary from './AssetRecipeLibrary';
import AssetGenerationHistory from './AssetGenerationHistory';
import { pageRoot, pageToolbar, pageToolbarEnd, subToolbarScroll } from '@/shared/ui/layoutClasses';
import AssetFolderOverlay from './AssetFolderOverlay';

export type { AssetTaskBatch } from './assetBatchUtils';

interface Props {
  onEnterBuyerShow: () => void;
  onOpenSettings: () => void;
}

export default function AssetCenter({ onEnterBuyerShow, onOpenSettings }: Props) {
  const { 
    hubGenerations, 
    setPreviewTask, 
    setCurrentView, 
    setQuickPrompt, 
    setProductData, 
    setStep,
    setSelectedStyleId
  } = useAppStore();

  // Top Tabs
  const [activeTab, setActiveTab] = useState<'history' | 'products' | 'recipes'>('history');

  // Sub-filter media categories (图片 | 视频 | 音频 | 文档)
  const [mediaCategory, setMediaCategory] = useState<'image' | 'video' | 'audio' | 'doc'>('image');

  // Sub-filter dropdowns (筛选 | 时间 | 排序)
  const [taskTypeFilter, setTaskTypeFilter] = useState<'all' | 'text2img' | 'img2img' | 'buyer_show'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 批量模式
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // 历史任务数据
  const [dbTasks, setDbTasks] = useState<any[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // 商品数据
  const [products, setProducts] = useState<any[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // 配方数据
  const [recipes, setRecipes] = useState<any[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);
  const [isExtractModalOpen, setIsExtractModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  const [isUpdatingRecipe, setIsUpdatingRecipe] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // 🌟 套组文件夹浮层弹窗
  const [folderBatch, setFolderBatch] = useState<AssetTaskBatch | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  useEffect(() => {
    setCategories(getMergedCategories());
  }, []);

  const handleCreateCategoryInAssetModal = () => {
    if (!newCategoryName.trim()) {
      alert('请输入品类名称');
      return;
    }
    const name = newCategoryName.trim();
    const id = `cat_${Date.now()}`;
    const newCat: CategoryItem = {
      id,
      name: name.startsWith('🏷️') || name.startsWith('📦') || name.startsWith('⛺') || name.startsWith('🚗') ? name : `🏷️ ${name}`,
      isCustom: true
    };
    const updated = [...categories, newCat];
    setCategories(updated);
    localStorage.setItem('custom_categories', JSON.stringify(updated));
    if (editingRecipe) {
      setEditingRecipe({ ...editingRecipe, category: id });
    }
    setIsCreatingCategory(false);
    setNewCategoryName('');
  };

  // 复制反馈
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 删除风格配方
  const handleDeleteRecipe = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirmAction('确定删除该自定义风格配方吗？'))) return;
    try {
      await apiFetch(`/api/catalog/styles?id=${id}`, { method: 'DELETE' });
      setRecipes(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      showToast(`❌ 删除配方失败: ${formatUserError(err, '请稍后重试')}`);
    }
  };

  // 保存配方修改
  const handleSaveEditedRecipe = async () => {
    if (!editingRecipe) return;
    setIsUpdatingRecipe(true);
    try {
      if (editingRecipe.id && !editingRecipe.isNew) {
        const res = await apiFetch('/api/catalog/styles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingRecipe.id,
            name: editingRecipe.name,
            category: editingRecipe.category,
            tag: editingRecipe.tag,
            desc: editingRecipe.desc,
            promptSnippet: editingRecipe.promptSnippet
          })
        });
        const data = await res.json();
        if (data.success) {
          setRecipes(prev => prev.map(r => r.id === editingRecipe.id ? data.recipe : r));
          setEditingRecipe(null);
        } else {
          showToast(`❌ 保存失败: ${data.error || '未知错误'}`);
        }
      } else {
        const res = await apiFetch('/api/catalog/styles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editingRecipe.name,
            category: editingRecipe.category || 'general',
            tag: editingRecipe.tag || '专属配方',
            desc: editingRecipe.desc || '',
            promptSnippet: editingRecipe.promptSnippet
          })
        });
        const data = await res.json();
        if (data.success) {
          setRecipes(prev => [data.recipe, ...prev]);
          setEditingRecipe(null);
        }
      }
    } catch (err) {
      showToast(`❌ 保存配方失败: ${formatUserError(err, '请稍后重试')}`);
    } finally {
      setIsUpdatingRecipe(false);
    }
  };

  // 1. 加载生图历史任务
  const fetchTasks = async () => {
    setIsLoadingTasks(true);
    try {
      const res = await apiFetch('/api/assets/tasks?pageSize=100').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success) {
          setDbTasks(filterDbTasksFromTombstones(data.tasks || []));
        }
      }
    } catch (err) {
      console.warn('加载生图任务历史轻微异常:', err);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  // 2. 加载商品库
  const fetchProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const res = await apiFetch('/api/catalog/products').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success) {
          setProducts(data.products || []);
        }
      }
    } catch (err) {
      console.warn('加载商品资产轻微异常:', err);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  // 3. 加载配方库
  const fetchRecipes = async () => {
    setIsLoadingRecipes(true);
    try {
      const res = await apiFetch('/api/catalog/styles').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success) {
          setRecipes(data.recipes || []);
        }
      }
    } catch (err) {
      console.warn('加载风格配方轻微异常:', err);
    } finally {
      setIsLoadingRecipes(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    if (activeTab === 'products' && products.length === 0 && !isLoadingProducts) {
      fetchProducts();
    }
    if (activeTab === 'recipes' && recipes.length === 0 && !isLoadingRecipes) {
      fetchRecipes();
    }
  }, [activeTab, isLoadingProducts, isLoadingRecipes, products.length, recipes.length]);

  // 合并内存中的 hubGenerations 与数据库中的任务
  const mergedTasks = useMemo(() => {
    const map = new Map<string, any>();
    
    // 1. 建立数据库任务快速索引表 (taskId, id, resultUrl)
    const dbByTaskId = new Map<string, any>();
    const dbById = new Map<string, any>();
    const dbByResultUrl = new Map<string, any>();
    dbTasks.forEach(t => {
      if (t.taskId) dbByTaskId.set(t.taskId, t);
      if (t.id) dbById.set(t.id, t);
      if (t.resultUrl) dbByResultUrl.set(t.resultUrl, t);
    });

    // 2. 遍历 hubGenerations，与数据库记录精准对齐
    hubGenerations.forEach(t => {
      if (isGenerationDeleted(t.id, t.taskId, t.resultUrl, t.dbId)) return;
      const matchedDb = (t.taskId ? dbByTaskId.get(t.taskId) : null) || 
        dbById.get(t.id) || 
        (t.resultUrl ? dbByResultUrl.get(t.resultUrl) : null);
      const isDbSuccess = matchedDb && matchedDb.status === 'SUCCESS' && matchedDb.resultUrl;
      
      const finalStatus = (t.resultUrl || isDbSuccess) ? 'SUCCESS' : (t.status || 'IN_PROGRESS');
      const finalResultUrl = t.resultUrl || (isDbSuccess ? matchedDb.resultUrl : undefined);

      const isTaskVideo = t.mediaType === 'video' || (matchedDb ? matchedDb.mediaType === 'video' : false) || (finalResultUrl?.includes('.mp4'));
      // 优先采用数据库经过校准填报的模型与规格
      const finalModel = matchedDb?.model || t.model || (isTaskVideo ? 'doubao-seedance-2.5' : 'gpt-image-2');
      const finalSize = matchedDb?.size || t.size || '3:4';
      const rawQuality = matchedDb?.quality || t.videoResolution || t.quality;
      const finalQuality = isTaskVideo 
        ? (rawQuality === 'high' || !rawQuality ? '720P' : rawQuality)
        : (rawQuality || 'medium');

      const entry = {
        id: t.id,
        dbId: matchedDb?.id,
        taskId: t.taskId || (matchedDb ? matchedDb.taskId : t.id),
        prompt: t.prompt,
        status: finalStatus,
        resultUrl: finalResultUrl,
        failReason: t.failReason || (matchedDb ? matchedDb.failReason : undefined),
        createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : (matchedDb ? matchedDb.createdAt : new Date().toISOString()),
        model: finalModel,
        mediaType: isTaskVideo ? 'video' : 'image',
        size: finalSize,
        quality: finalQuality,
        videoDuration: t.videoDuration,
        videoResolution: isTaskVideo ? finalQuality : undefined,
        product: matchedDb?.product || null
      };

      map.set(t.id, entry);
      if (entry.taskId && entry.taskId !== t.id) {
        map.set(entry.taskId, entry);
      }
      if (entry.dbId && entry.dbId !== t.id) {
        map.set(entry.dbId, entry);
      }
      if (entry.resultUrl) {
        map.set(entry.resultUrl, entry);
      }
    });

    // 3. 补充数据库中剩余的历史任务 (去重)
    dbTasks.forEach(t => {
      if (isGenerationDeleted(t.id, t.taskId, t.resultUrl, t.id)) return;
      if (!map.has(t.id) && (!t.taskId || !map.has(t.taskId))) {
        const isTaskVideo = t.mediaType === 'video' || t.resultUrl?.includes('.mp4');
        const rawQuality = t.quality;
        const finalQuality = isTaskVideo 
          ? (rawQuality === 'high' || !rawQuality ? '720P' : rawQuality)
          : (rawQuality || 'medium');

        const entry = {
          ...t,
          dbId: t.id,
          mediaType: isTaskVideo ? 'video' : 'image',
          model: t.model || (isTaskVideo ? 'doubao-seedance-2.5' : 'gpt-image-2'),
          size: t.size || '3:4',
          quality: finalQuality
        };
        map.set(t.id, entry);
        if (t.taskId) map.set(t.taskId, entry);
      }
    });

    // 去除重复实体并提取数组
    const uniqueList: any[] = [];
    const seenIds = new Set<string>();
    for (const t of map.values()) {
      const key = t.taskId || t.id;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        uniqueList.push(t);
      }
    }

    let list = uniqueList;

    // 1. 媒体分类过滤 (图片 / 视频 / 音频 / 文档)
    if (mediaCategory === 'image') {
      list = list.filter(t => t.mediaType !== 'video' && !t.resultUrl?.includes('.mp4'));
    } else if (mediaCategory === 'video') {
      list = list.filter(t => t.mediaType === 'video' || t.resultUrl?.includes('.mp4'));
    } else if (mediaCategory === 'audio' || mediaCategory === 'doc') {
      list = []; // 当前无音频/文档任务，展示空状态
    }

    // 2. 任务模式过滤
    if (taskTypeFilter === 'text2img') {
      list = list.filter(t => !t.product && !t.useReferenceImage);
    } else if (taskTypeFilter === 'img2img') {
      list = list.filter(t => t.useReferenceImage || t.product);
    } else if (taskTypeFilter === 'buyer_show') {
      list = list.filter(t => t.product || t.prompt?.includes('买家秀') || t.title?.includes('分镜'));
    }

    // 3. 关键词搜索
    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      list = list.filter(t => (t.prompt || '').toLowerCase().includes(kw) || (t.title || '').toLowerCase().includes(kw));
    }

    // 4. 时间周期过滤
    if (timeFilter !== 'all') {
      const now = Date.now();
      list = list.filter(t => {
        const itemTime = new Date(t.createdAt).getTime();
        if (timeFilter === 'today') {
          return new Date(t.createdAt).toDateString() === new Date().toDateString();
        }
        if (timeFilter === 'yesterday') {
          const yDay = new Date();
          yDay.setDate(yDay.getDate() - 1);
          return new Date(t.createdAt).toDateString() === yDay.toDateString();
        }
        if (timeFilter === '7days') {
          return (now - itemTime) <= 7 * 86400000;
        }
        if (timeFilter === '30days') {
          return (now - itemTime) <= 30 * 86400000;
        }
        return true;
      });
    }

    // 5. 排序
    list.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [hubGenerations, dbTasks, searchKeyword, mediaCategory, taskTypeFilter, timeFilter, sortOrder]);

  // DB 成功态同步到 store（副作用放在 useEffect，避免 useMemo 内写状态）
  useEffect(() => {
    const dbByTaskId = new Map<string, any>();
    const dbById = new Map<string, any>();
    const dbByResultUrl = new Map<string, any>();
    dbTasks.forEach((t: any) => {
      if (t.taskId) dbByTaskId.set(t.taskId, t);
      if (t.id) dbById.set(t.id, t);
      if (t.resultUrl) dbByResultUrl.set(t.resultUrl, t);
    });
    hubGenerations.forEach((t) => {
      const matchedDb =
        (t.taskId ? dbByTaskId.get(t.taskId) : null) ||
        dbById.get(t.id) ||
        (t.resultUrl ? dbByResultUrl.get(t.resultUrl) : null);
      if (matchedDb && matchedDb.status === 'SUCCESS' && matchedDb.resultUrl && t.status !== 'SUCCESS') {
        useAppStore.getState().updateHubGeneration(t.id, {
          status: 'SUCCESS',
          resultUrl: matchedDb.resultUrl,
          progress: '100%',
        });
      }
    });
  }, [dbTasks, hubGenerations]);

  // 轮询由全局 useGenerationEngine 负责；此处仅在任务完成时刷新 DB 列表
  const prevRunningCountRef = useRef(0);
  useEffect(() => {
    const runningCount = mergedTasks.filter(
      (t) => (t.status === 'IN_PROGRESS' || t.status === 'PENDING') && !t.resultUrl && t.taskId
    ).length;
    if (prevRunningCountRef.current > 0 && runningCount < prevRunningCountRef.current) {
      fetchTasks();
    }
    prevRunningCountRef.current = runningCount;
  }, [mergedTasks]);

  // 按时间分组：今天、昨天、更早
  const groupedTasks = useMemo(() => {
    const today: any[] = [];
    const yesterday: any[] = [];
    const earlier: any[] = [];

    const now = new Date();
    const todayStr = now.toDateString();

    const yDay = new Date();
    yDay.setDate(yDay.getDate() - 1);
    const yesterdayStr = yDay.toDateString();

    mergedTasks.forEach(task => {
      const d = new Date(task.createdAt);
      if (d.toDateString() === todayStr) {
        today.push(task);
      } else if (d.toDateString() === yesterdayStr) {
        yesterday.push(task);
      } else {
        earlier.push(task);
      }
    });

    return { today, yesterday, earlier };
  }, [mergedTasks]);

  // 🌟 按时间桶聚合成可折叠/堆叠的批次列表
  const groupedBatches = useMemo(() => {
    return {
      today: groupTasksIntoBatches(groupedTasks.today),
      yesterday: groupTasksIntoBatches(groupedTasks.yesterday),
      earlier: groupTasksIntoBatches(groupedTasks.earlier)
    };
  }, [groupedTasks]);

  // 🌟 性能大飞跃：虚拟分页与渐进渲染 (首屏轻量 24 批次瞬间秒开，触底平滑追加，丝滑 60FPS)
  const [visibleBatchLimit, setVisibleBatchLimit] = useState(12);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  // 筛选/切换 Tab 时重置分页计数
  useEffect(() => {
    setVisibleBatchLimit(12);
  }, [mediaCategory, taskTypeFilter, timeFilter, sortOrder, searchKeyword, activeTab]);

  // 监听底部哨兵元素，向下滚动时平滑追加渲染批次
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleBatchLimit(prev => prev + 16);
      }
    }, { rootMargin: '300px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [groupedBatches]);

  // 智能切片当前视口可见的批次列表
  const { visibleToday, visibleYesterday, visibleEarlier, totalBatches, renderedBatches, hasMore } = useMemo(() => {
    let remaining = visibleBatchLimit;
    const vToday = groupedBatches.today.slice(0, remaining);
    remaining = Math.max(0, remaining - vToday.length);

    const vYesterday = remaining > 0 ? groupedBatches.yesterday.slice(0, remaining) : [];
    remaining = Math.max(0, remaining - vYesterday.length);

    const vEarlier = remaining > 0 ? groupedBatches.earlier.slice(0, remaining) : [];

    const total = groupedBatches.today.length + groupedBatches.yesterday.length + groupedBatches.earlier.length;
    const rendered = vToday.length + vYesterday.length + vEarlier.length;

    return {
      visibleToday: vToday,
      visibleYesterday: vYesterday,
      visibleEarlier: vEarlier,
      totalBatches: total,
      renderedBatches: rendered,
      hasMore: rendered < total
    };
  }, [groupedBatches, visibleBatchLimit]);

  // 获取尺寸比例对应 CSS 类 (精准还原各比例卡片画幅)
  const getAspectRatioClass = (sizeStr?: string) => {
    if (!sizeStr) return 'aspect-[3/4]';
    const ratio = getAspectRatioFromSize(sizeStr);
    switch (ratio) {
      case '1:1': return 'aspect-square';
      case '16:9': return 'aspect-[16/9]';
      case '9:16': return 'aspect-[9/16]';
      case '4:3': return 'aspect-[4/3]';
      case '3:4': return 'aspect-[3/4]';
      case '3:2': return 'aspect-[3/2]';
      case '2:3': return 'aspect-[2/3]';
      case '4:5': return 'aspect-[4/5]';
      case '5:4': return 'aspect-[5/4]';
      case '21:9': return 'aspect-[21/9]';
      default: return 'aspect-[3/4]';
    }
  };

  // 批量删除整批任务
  const handleDeleteBatch = async (batch: AssetTaskBatch, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirmAction(`确定彻底删除该批次的全部 ${batch.tasks.length} 张生成记录吗？删除后将从数据库永久移除。`))) return;

    const result = await permanentDeleteGeneration(
      batch.tasks.map((t) => ({
        id: t.id,
        taskId: t.taskId,
        dbId: t.dbId,
        resultUrl: t.resultUrl,
      })),
    );
    if (!result.ok) {
      showToast(result.error || '删除失败，请稍后重试');
      return;
    }

    setDbTasks((prev) => filterDbTasksAfterDelete(prev, result.ids, result.urls));

    if (result.partial) {
      showToast(`已从数据库删除 ${result.count} 条记录（部分条目可能未匹配到数据库）`);
    } else {
      showToast(`已从数据库彻底删除该批次共 ${batch.tasks.length} 条记录`);
    }
  };

  // 复用批次提示词前往生成
  const handleReuseBatch = (batch: AssetTaskBatch, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickPrompt(batch.prompt);
    setCurrentView('hub');
    showToast('✨ 已复用提示词并前往创作');
  };

  // 智能删除生图任务 (同时物理清理 DB 中的记录，并同步全局 Store 与本地存储)
  const handleDeleteTask = async (taskOrId: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const id = typeof taskOrId === 'string' ? taskOrId : taskOrId.id;
    const taskId = typeof taskOrId === 'object' ? taskOrId.taskId : null;
    const dbId = typeof taskOrId === 'object' ? taskOrId.dbId : null;
    const resultUrl = typeof taskOrId === 'object' ? (taskOrId.resultUrl || taskOrId.imageUrl) : null;

    const result = await permanentDeleteGeneration({ id, taskId, dbId, resultUrl });
    if (!result.ok) {
      showToast(result.error || '删除失败，请稍后重试');
      return;
    }

    setDbTasks((prev) => filterDbTasksAfterDelete(prev, result.ids, result.urls));
    showToast('已从数据库彻底删除该生成记录');
  };

  // 🌟 批量打包下载选中的生成历史图片 (ZIP)
  const handleBatchDownload = async () => {
    if (selectedTaskIds.length === 0) {
      showToast('⚠️ 请先勾选需要下载的图片记录');
      return;
    }

    const selectedTasks = mergedTasks.filter(t => 
      (selectedTaskIds.includes(t.id) || (t.taskId && selectedTaskIds.includes(t.taskId))) &&
      Boolean(t.resultUrl || t.imageUrl)
    );

    if (selectedTasks.length === 0) {
      showToast('⚠️ 选中的记录中没有已生成成功的图片');
      return;
    }

    setIsDownloadingZip(true);
    showToast(`⏳ 正在打包下载 ${selectedTasks.length} 张高清图片...`);

    try {
      const itemsToExport = selectedTasks.map((t, idx) => {
        const cleanTitle = (t.title || 'AI生图').replace(/[\\/:*?"<>|]/g, '_');
        return {
          url: t.resultUrl || t.imageUrl || '',
          filename: `${String(idx + 1).padStart(2, '0')}_${cleanTitle.slice(0, 20)}.jpg`,
          shotNo: idx + 1,
          title: t.title || 'AI生图',
          prompt: t.prompt
        };
      });

      const res = await apiFetch('/api/generate/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: `AI生图高清资产_${new Date().toISOString().slice(0, 10)}`,
          images: itemsToExport
        })
      });

      if (!res.ok) {
        throw new Error('打包下载服务响应异常');
      }

      const blob = await res.blob();
      const zipName = `AI生图高清资产_${selectedTasks.length}张_${Date.now()}.zip`;
      await saveToDownloadDir(zipName, blob);

      showToast(`🎉 成功打包并下载 ${selectedTasks.length} 张高清图片！`);
    } catch (err: any) {
      console.error('批量下载失败:', err);
      showToast(`❌ 批量下载失败: ${formatUserError(err, '请稍后重试')}`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // 🌟 一键导出全部资产并同步到剪映 (打包全部成功的图片与视频)
  const handleBatchDownloadAll = async () => {
    const allSuccess = mergedTasks.filter(t => Boolean(t.resultUrl || t.imageUrl));
    if (allSuccess.length === 0) {
      showToast('⚠️ 当前分类下没有已生成的图片或视频资产');
      return;
    }

    setIsDownloadingZip(true);
    showToast(`⏳ 正在打包 ${allSuccess.length} 项生成资产供剪映导入...`);

    try {
      const itemsToExport = allSuccess.map((t, idx) => {
        const cleanTitle = (t.title || 'AI生成').replace(/[\\/:*?"<>|]/g, '_');
        const isVid = t.mediaType === 'video' || t.resultUrl?.includes('.mp4');
        return {
          url: t.resultUrl || t.imageUrl || '',
          filename: `${String(idx + 1).padStart(2, '0')}_${cleanTitle.slice(0, 20)}.${isVid ? 'mp4' : 'jpg'}`,
          shotNo: idx + 1,
          title: t.title || 'AI生成',
          prompt: t.prompt
        };
      });

      const res = await apiFetch('/api/generate/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: `剪映素材包_${new Date().toISOString().slice(0, 10)}`,
          images: itemsToExport
        })
      });

      if (!res.ok) throw new Error('打包服务响应异常');
      const blob = await res.blob();
      await saveToDownloadDir(`剪映素材包_${allSuccess.length}项_${Date.now()}.zip`, blob);

      showToast('✨ 剪映素材包已下载！解压后可直接拖入剪映草稿');
    } catch (err: any) {
      console.error('同步剪映导出失败:', err);
      showToast(`❌ 导出失败: ${formatUserError(err, '请稍后重试')}`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedTaskIds.length === 0) return;
    if (!(await confirmAction(`确定彻底删除选中的 ${selectedTaskIds.length} 项生成记录吗？删除后将从数据库彻底永久移除。`))) return;

    const targetIds = new Set(selectedTaskIds);

    const targets = mergedTasks.filter(
      (t) =>
        targetIds.has(t.id) ||
        (t.taskId && targetIds.has(t.taskId)) ||
        (t.dbId && targetIds.has(t.dbId)),
    );

    const result = await permanentDeleteGeneration(
      targets.map((t) => ({
        id: t.id,
        taskId: t.taskId,
        dbId: t.dbId,
        resultUrl: t.resultUrl,
      })),
    );
    if (!result.ok) {
      showToast(result.error || '删除失败，请稍后重试');
      return;
    }

    setDbTasks((prev) => filterDbTasksAfterDelete(prev, result.ids, result.urls));

    const count = targetIds.size;
    setSelectedTaskIds([]);
    setIsBatchMode(false);
    if (result.partial) {
      showToast(`已从数据库删除 ${result.count} 条记录（部分条目可能未匹配到数据库）`);
    } else {
      showToast(`🗑️ 已成功从数据库批量删除 ${count} 条生成记录`);
    }
  };

  // 🌟 一键清理全部失败或超时的卡死任务
  const handleClearFailedAndStuck = async () => {
    const failedTasks = mergedTasks.filter(t => t.status === 'FAILURE' || (!t.resultUrl && (t.status === 'IN_PROGRESS' || t.status === 'PENDING')));
    if (failedTasks.length === 0) {
      showToast('ℹ️ 当前没有失败或卡顿的任务');
      return;
    }

    const allIdsToDelete = new Set<string>();
    failedTasks.forEach(t => {
      if (t.id) allIdsToDelete.add(t.id);
      if (t.taskId) allIdsToDelete.add(t.taskId);
      if (t.dbId) allIdsToDelete.add(t.dbId);
    });

    const result = await clearFailedTasksFromServer();
    if (!result.ok) {
      showToast(result.error || '清理失败，请稍后重试');
      return;
    }

    setDbTasks(prev => prev.filter(t => t.status === 'SUCCESS' && t.resultUrl && !allIdsToDelete.has(t.id) && (!t.taskId || !allIdsToDelete.has(t.taskId))));

    // 3. 全局 Store 与本地存储同步清理
    useAppStore.getState().deleteGenerationPermanently(Array.from(allIdsToDelete));

    setSelectedTaskIds([]);
    setIsBatchMode(false);
    showToast(`🧹 已成功清理 ${failedTasks.length} 个失败/卡顿的异常任务记录`);
  };

  // 删除商品
  const handleDeleteProduct = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirmAction('确定从本地商品库中移除该商品吗？'))) return;
    try {
      await apiFetch(`/api/catalog/products?id=${id}`, { method: 'DELETE' });
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      showToast(`❌ 删除商品失败: ${formatUserError(err, '请稍后重试')}`);
    }
  };

  // 载入商品到工坊
  const handleLoadProduct = (prod: any) => {
    let details: string[] = [];
    try {
      if (typeof prod.detailUrls === 'string') {
        const parsed = JSON.parse(prod.detailUrls);
        if (Array.isArray(parsed)) {
          details = parsed;
        } else if (parsed && typeof parsed === 'object') {
          details = Array.isArray(parsed.details) ? parsed.details : [];
        } else if (typeof parsed === 'string') {
          details = [parsed];
        }
      } else if (Array.isArray(prod.detailUrls)) {
        details = prod.detailUrls;
      }
    } catch (e) {
      details = typeof prod.detailUrls === 'string' && prod.detailUrls ? [prod.detailUrls] : [];
    }

    setProductData(
      {
        title: prod.title || '已存商品',
        itemId: prod.itemId || '',
        price: prod.price || '---',
        platform: prod.platform || 'jd'
      },
      {
        main: prod.picUrl ? [prod.picUrl] : [],
        details: Array.isArray(details) ? details : [],
        skus: []
      },
      'database_cache'
    );

    setStep(2);
    setCurrentView('buyer_show');
  };

  // 载入配方到工坊
  const handleApplyRecipe = (recipe: any) => {
    setSelectedStyleId(recipe.id);
    setStep(2);
    setCurrentView('buyer_show');
  };

  // 再做一张
  const handleRegenerate = (task: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickPrompt(task.prompt);
    setCurrentView('hub');
  };

  // 全选/取消全选
  const handleToggleSelectAll = () => {
    if (selectedTaskIds.length === mergedTasks.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(mergedTasks.map(t => t.id));
    }
  };

  const historyProps = {
    mediaCategory,
    setMediaCategory,
    taskTypeFilter,
    setTaskTypeFilter,
    timeFilter,
    setTimeFilter,
    sortOrder,
    setSortOrder,
    mergedTasks,
    visibleToday,
    visibleYesterday,
    visibleEarlier,
    hasMore,
    renderedBatches,
    totalBatches,
    loadMoreSentinelRef,
    isBatchMode,
    selectedTaskIds,
    setSelectedTaskIds,
    setIsBatchMode,
    copiedId,
    setCopiedId,
    setCurrentView,
    setPreviewTask,
    setQuickPrompt,
    showToast,
    onDeleteBatch: handleDeleteBatch,
    onDeleteTask: handleDeleteTask,
    onRegenerate: handleRegenerate,
  };

  return (
    <div className={`${pageRoot} bg-[#FAFAFC] select-none`}>
      {/* 🌟 1. Top Header Bar (胶囊标签导航 + 搜索/批量/剪映导出) */}
      <div className={`min-h-14 py-2 px-6 lg:px-8 border-b border-slate-200/80 bg-white ${pageToolbar} flex-shrink-0 shadow-2xs`}>
        {/* Left: Tab Switcher (胶囊切换: 生成历史 | 主体 | 画布) */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl shrink-0">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            生成历史
          </button>

          <button
            onClick={() => setActiveTab('products')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'products'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            主体
          </button>

          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'recipes'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            画布
          </button>
        </div>

        {/* Right: Actions Bar */}
        <div className={`${pageToolbarEnd} ${subToolbarScroll}`}>
          {/* Search Box */}
          <div className="relative flex items-center min-w-[120px] max-w-[200px] sm:max-w-[240px] flex-1 sm:flex-none">
            <Search className="w-3.5 h-3.5 absolute left-3 pointer-events-none text-slate-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="搜索提示词..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-100/80 focus:bg-white border border-transparent focus:border-indigo-400 text-xs text-slate-900 placeholder-slate-400 outline-none transition-all shadow-2xs"
            />
          </div>

          {activeTab === 'history' && (
            <>
              {/* 一键清理失败/卡顿任务按钮 */}
              {mergedTasks.some(t => t.status === 'FAILURE' || (!t.resultUrl && (t.status === 'IN_PROGRESS' || t.status === 'PENDING'))) && (
                <button
                  onClick={handleClearFailedAndStuck}
                  className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="一键清理所有失败或超时的异常生图记录"
                >
                  <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                  <span>清理失败</span>
                </button>
              )}

              {isBatchMode ? (
                <div className="flex items-center gap-2 animate-fade-in flex-nowrap">
                  <button
                    onClick={handleToggleSelectAll}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {selectedTaskIds.length === mergedTasks.length ? (
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    <span>{selectedTaskIds.length === mergedTasks.length ? '取消全选' : '全选'}</span>
                  </button>

                  {/* 🌟 批量打包下载按钮 */}
                  <button
                    onClick={handleBatchDownload}
                    disabled={selectedTaskIds.length === 0 || isDownloadingZip}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                    title="一键将选中的生图记录打包为 ZIP 压缩包并下载到本地"
                  >
                    {isDownloadingZip ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-indigo-600" />
                    )}
                    <span>{isDownloadingZip ? '正在打包...' : `批量下载 (${selectedTaskIds.length})`}</span>
                  </button>

                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedTaskIds.length === 0}
                    className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>批量删除 ({selectedTaskIds.length})</span>
                  </button>

                  <button
                    onClick={() => { setIsBatchMode(false); setSelectedTaskIds([]); }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
                  >
                    退出批量
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsBatchMode(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>批量操作</span>
                </button>
              )}
            </>
          )}

          {activeTab === 'recipes' && (
            <button
              onClick={() => setIsExtractModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+ 架构推理</span>
            </button>
          )}
        </div>
      </div>

      {/* 🌟 2. Sub Filter Toolbar */}
      {activeTab === 'history' && (
        <AssetGenerationHistory {...historyProps} section="toolbar" />
      )}

      {/* 🌟 3. Main Gallery / Content Area */}
      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6">
        {activeTab === 'history' && (
          <AssetGenerationHistory {...historyProps} section="gallery" />
        )}

        {activeTab === 'products' && (
          <AssetProductLibrary
            products={products}
            onEnterBuyerShow={onEnterBuyerShow}
            onDeleteProduct={handleDeleteProduct}
            onLoadProduct={handleLoadProduct}
          />
        )}

        {activeTab === 'recipes' && (
          <AssetRecipeLibrary
            recipes={recipes}
            copiedId={copiedId}
            setCopiedId={setCopiedId}
            editingRecipe={editingRecipe}
            setEditingRecipe={setEditingRecipe}
            isUpdatingRecipe={isUpdatingRecipe}
            categories={categories}
            isCreatingCategory={isCreatingCategory}
            setIsCreatingCategory={setIsCreatingCategory}
            newCategoryName={newCategoryName}
            setNewCategoryName={setNewCategoryName}
            setIsExtractModalOpen={setIsExtractModalOpen}
            setIsCategoryManagerOpen={setIsCategoryManagerOpen}
            onDeleteRecipe={handleDeleteRecipe}
            onApplyRecipe={handleApplyRecipe}
            onSaveEditedRecipe={handleSaveEditedRecipe}
            onCreateCategory={handleCreateCategoryInAssetModal}
            section="list"
          />
        )}
      </div>

      <AssetRecipeLibrary
            recipes={recipes}
            copiedId={copiedId}
            setCopiedId={setCopiedId}
            editingRecipe={editingRecipe}
            setEditingRecipe={setEditingRecipe}
            isUpdatingRecipe={isUpdatingRecipe}
            categories={categories}
            isCreatingCategory={isCreatingCategory}
            setIsCreatingCategory={setIsCreatingCategory}
            newCategoryName={newCategoryName}
            setNewCategoryName={setNewCategoryName}
            setIsExtractModalOpen={setIsExtractModalOpen}
            setIsCategoryManagerOpen={setIsCategoryManagerOpen}
            onDeleteRecipe={handleDeleteRecipe}
            onApplyRecipe={handleApplyRecipe}
            onSaveEditedRecipe={handleSaveEditedRecipe}
            onCreateCategory={handleCreateCategoryInAssetModal}
        section="modal"
      />

      {/* Style Extract Modal */}
      <StyleExtractModal
        isOpen={isExtractModalOpen}
        onClose={() => setIsExtractModalOpen(false)}
        onRecipeCreated={(newRecipe) => {
          setRecipes(prev => [newRecipe, ...prev]);
        }}
      />

      {folderBatch && (
        <AssetFolderOverlay
          folderBatch={folderBatch}
          isDownloadingZip={isDownloadingZip}
          setIsDownloadingZip={setIsDownloadingZip}
          showToast={showToast}
          setQuickPrompt={setQuickPrompt}
          setPreviewTask={setPreviewTask}
          onClose={() => setFolderBatch(null)}
        />
      )}

      {/* 🌟 全局反馈 Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold shadow-2xl border border-slate-700/80 animate-fade-in flex items-center gap-2">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 🌟 品类管理与删除弹窗 */}
      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        onCategoriesChanged={updated => setCategories(updated)}
      />
    </div>
  );
}
