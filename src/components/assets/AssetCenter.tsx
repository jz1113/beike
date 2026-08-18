'use client';
import { useState, useEffect, useMemo } from 'react';
import { 
  FolderArchive, 
  Sparkles, 
  ShoppingBag, 
  Clock, 
  Search, 
  Trash2, 
  Download, 
  Copy, 
  Check, 
  ArrowRight, 
  Eye, 
  RotateCw, 
  Filter, 
  SlidersHorizontal, 
  CheckSquare, 
  Square, 
  Loader2, 
  AlertCircle,
  FileImage,
  ImageIcon,
  Grid,
  Calendar,
  Layers,
  ArrowUpDown,
  ExternalLink,
  ChevronDown,
  Film,
  Video,
  Scissors,
  Play,
  Volume2,
  FileText,
  LayoutGrid,
  Edit3,
  Sliders,
  X,
  Plus
} from 'lucide-react';
import { useAppStore, GenerationTask } from '@/store/useAppStore';
import { JdIcon, TaobaoIcon } from '@/components/common/BrandIcons';
import StyleExtractModal from '@/components/modals/StyleExtractModal';
import { formatDisplayModel } from '@/lib/drawing';
import CategoryManagerModal from '@/components/modals/CategoryManagerModal';
import { getMergedCategories, DEFAULT_CATEGORIES, CategoryItem } from '@/lib/vision';
import { getAspectRatioFromSize } from '@/lib/drawing';
import { getClientStorageHeaders } from '@/lib/storage';
import AIGeneratingCard from '@/components/common/AIGeneratingCard';

export interface AssetTaskBatch {
  batchId: string;
  title?: string;
  prompt: string;
  model: string;
  size?: string;
  quality?: string;
  createdAt: string | number;
  tasks: any[];
}

// 智能按批次聚合任务 (支持相同 batchId、相同提示词近邻时间聚合)
function groupTasksIntoBatches(tasks: any[]): AssetTaskBatch[] {
  const groups: AssetTaskBatch[] = [];
  const sorted = [...tasks].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return timeB - timeA;
  });

  sorted.forEach((task, idx) => {
    const taskCreatedAt = new Date(task.createdAt).getTime();
    const existing = groups.find(g => {
      const gCreatedAt = new Date(g.createdAt).getTime();
      if (task.batchId && g.batchId === task.batchId) return true;
      if (task.batchId && g.tasks.some(t => t.batchId === task.batchId)) return true;
      if (!task.batchId && g.prompt === task.prompt && Math.abs(taskCreatedAt - gCreatedAt) < 10000) return true;
      if (!task.batchId && Math.abs(taskCreatedAt - gCreatedAt) < 3000) return true;
      return false;
    });

    if (existing) {
      existing.tasks.push(task);
    } else {
      const uniqueFallbackId = `batch-${task.id || task.taskId || task.createdAt || 0}-${idx}`;
      const isTaskVideo = task.mediaType === 'video' || task.resultUrl?.includes('.mp4');
      const taskQuality = isTaskVideo
        ? (task.quality === 'high' || !task.quality ? '720P' : task.quality)
        : (task.quality === 'high' ? '2K' : (task.quality || '2K'));

      groups.push({
        batchId: task.batchId || uniqueFallbackId,
        prompt: task.prompt || '',
        title: task.title,
        model: task.model || (isTaskVideo ? 'doubao-seedance-2.5' : 'gpt-image-2'),
        size: task.size || '3:4',
        quality: taskQuality,
        createdAt: task.createdAt,
        tasks: [task]
      });
    }
  });

  // 🌟 核心：确保每个批次内的分镜卡片严格按照正序排列 (第 1 张 -> 第 2 张 -> 第 3 张... 第 6 张)
  groups.forEach(g => {
    g.tasks.sort((a, b) => {
      if (typeof a.shotNo === 'number' && typeof b.shotNo === 'number') {
        return a.shotNo - b.shotNo;
      }
      const numA = a.title?.match(/第\s*(\d+)\s*张/)?.[1];
      const numB = b.title?.match(/第\s*(\d+)\s*张/)?.[1];
      if (numA && numB) {
        return parseInt(numA, 10) - parseInt(numB, 10);
      }
      const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
      const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
      return tA - tB;
    });

    if (g.tasks[0] && g.tasks[0].prompt) {
      g.prompt = g.tasks[0].prompt;
    }
  });

  return groups;
}

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
  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});

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
    if (!confirm('确定删除该自定义风格配方吗？')) return;
    try {
      await fetch(`/api/styles?id=${id}`, { method: 'DELETE' });
      setRecipes(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('删除配方失败:', err);
    }
  };

  // 保存配方修改
  const handleSaveEditedRecipe = async () => {
    if (!editingRecipe) return;
    setIsUpdatingRecipe(true);
    try {
      if (editingRecipe.id && !editingRecipe.isNew) {
        const res = await fetch('/api/styles', {
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
        }
      } else {
        const res = await fetch('/api/styles', {
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
      console.error('保存配方失败:', err);
    } finally {
      setIsUpdatingRecipe(false);
    }
  };

  // 1. 加载生图历史任务
  const fetchTasks = async () => {
    setIsLoadingTasks(true);
    try {
      const res = await fetch('/api/tasks').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success) {
          setDbTasks(data.tasks || []);
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
      const res = await fetch('/api/products').catch(() => null);
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
      const res = await fetch('/api/styles').catch(() => null);
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
    fetchProducts();
    fetchRecipes();
  }, []);

  // 合并内存中的 hubGenerations 与数据库中的任务 (智能关联与状态自动修复同步)
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
      const matchedDb = (t.taskId ? dbByTaskId.get(t.taskId) : null) || 
        dbById.get(t.id) || 
        (t.resultUrl ? dbByResultUrl.get(t.resultUrl) : null);
      const isDbSuccess = matchedDb && matchedDb.status === 'SUCCESS' && matchedDb.resultUrl;
      
      const finalStatus = (t.resultUrl || isDbSuccess) ? 'SUCCESS' : (t.status || 'IN_PROGRESS');
      const finalResultUrl = t.resultUrl || (isDbSuccess ? matchedDb.resultUrl : undefined);

      // 如果数据库中已成功而内存中还是生成中，同步修复 store 状态
      if (isDbSuccess && t.status !== 'SUCCESS') {
        useAppStore.getState().updateHubGeneration(t.id, {
          status: 'SUCCESS',
          resultUrl: matchedDb.resultUrl,
          progress: '100%'
        });
      }

      const isTaskVideo = t.mediaType === 'video' || (matchedDb ? matchedDb.mediaType === 'video' : false) || (finalResultUrl?.includes('.mp4'));
      // 优先采用数据库经过校准填报的模型与规格
      const finalModel = matchedDb?.model || t.model || (isTaskVideo ? 'doubao-seedance-2.5' : 'gpt-image-2');
      const finalSize = matchedDb?.size || t.size || '3:4';
      const rawQuality = matchedDb?.quality || t.videoResolution || t.quality;
      const finalQuality = isTaskVideo 
        ? (rawQuality === 'high' || !rawQuality ? '720P' : rawQuality)
        : (rawQuality === 'high' ? '2K' : (rawQuality || '2K'));

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
      if (!map.has(t.id) && (!t.taskId || !map.has(t.taskId))) {
        const isTaskVideo = t.mediaType === 'video' || t.resultUrl?.includes('.mp4');
        const rawQuality = t.quality;
        const finalQuality = isTaskVideo 
          ? (rawQuality === 'high' || !rawQuality ? '720P' : rawQuality)
          : (rawQuality === 'high' ? '2K' : (rawQuality || '2K'));

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

  // 🌟 自动轮询未完成的生图任务 (确保在资产页也能即时获取生成完毕的原图)
  useEffect(() => {
    const runningTasks = mergedTasks.filter(t => (t.status === 'IN_PROGRESS' || t.status === 'PENDING') && !t.resultUrl && t.taskId);
    if (runningTasks.length === 0) return;

    const interval = setInterval(async () => {
      let hasCompleted = false;
      for (const t of runningTasks) {
        try {
          const localUrl = typeof window !== 'undefined' ? localStorage.getItem('ai_base_url') || '' : '';
          const localKey = typeof window !== 'undefined' ? localStorage.getItem('ai_api_key') || '' : '';
          const queryParams = new URLSearchParams({ taskId: t.taskId! });
          if (localUrl) queryParams.set('customBaseUrl', localUrl);
          if (localKey) queryParams.set('customApiKey', localKey);

          const isVideoTask = t.mediaType === 'video' || t.model?.toLowerCase().includes('seedance') || t.model?.toLowerCase().includes('veo') || t.model?.toLowerCase().includes('kling') || t.model?.toLowerCase().includes('sora') || t.model?.toLowerCase().includes('gen3') || t.model?.toLowerCase().includes('hunyuan');
          const pollEndpoint = isVideoTask ? '/api/generate-video' : '/api/generate-image';

          const res = await fetch(`${pollEndpoint}?${queryParams.toString()}`, {
            headers: getClientStorageHeaders()
          }).catch(() => null);
          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (data?.status === 'SUCCESS' && data?.resultUrl) {
              useAppStore.getState().updateHubGeneration(t.id, {
                status: 'SUCCESS',
                resultUrl: data.resultUrl,
                progress: '100%'
              });
              hasCompleted = true;
            } else if (data?.status === 'FAILURE') {
              useAppStore.getState().updateHubGeneration(t.id, {
                status: 'FAILURE',
                failReason: data.failReason || '渲染失败'
              });
              hasCompleted = true;
            }
          }
        } catch (e) {}
      }

      if (hasCompleted) {
        fetchTasks();
      }
    }, 2500);

    return () => clearInterval(interval);
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
    if (!confirm(`确定彻底删除该批次的全部 ${batch.tasks.length} 张生成记录吗？删除后将从数据库永久移除。`)) return;
    const allIdsToDelete = new Set<string>();
    const allUrlsToDelete = new Set<string>();

    batch.tasks.forEach(t => {
      if (t.id) allIdsToDelete.add(t.id);
      if (t.taskId) allIdsToDelete.add(t.taskId);
      if (t.dbId) allIdsToDelete.add(t.dbId);
      if (t.resultUrl) allUrlsToDelete.add(t.resultUrl);
    });

    try {
      await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(allIdsToDelete),
          urls: Array.from(allUrlsToDelete)
        })
      });
    } catch (err) {
      console.error('删除批次记录失败:', err);
    }

    setDbTasks(prev => prev.filter(t => 
      !allIdsToDelete.has(t.id) && 
      (!t.taskId || !allIdsToDelete.has(t.taskId)) &&
      (!t.resultUrl || !allUrlsToDelete.has(t.resultUrl))
    ));

    useAppStore.getState().deleteGenerationPermanently(Array.from(allIdsToDelete), Array.from(allUrlsToDelete));

    showToast(`🗑️ 已从数据库彻底删除该批次共 ${batch.tasks.length} 条记录`);
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

    const allIdsToDelete = new Set<string>();
    const allUrlsToDelete = new Set<string>();
    if (id) allIdsToDelete.add(id);
    if (taskId) allIdsToDelete.add(taskId);
    if (dbId) allIdsToDelete.add(dbId);
    if (resultUrl) allUrlsToDelete.add(resultUrl);

    // 1. 发起后端数据库物理删除
    try {
      await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(allIdsToDelete),
          urls: Array.from(allUrlsToDelete)
        })
      });
    } catch (err) {
      console.error('删除生图记录失败:', err);
    }

    // 2. 本地组件状态过滤
    setDbTasks(prev => prev.filter(t => 
      !allIdsToDelete.has(t.id) && 
      (!t.taskId || !allIdsToDelete.has(t.taskId)) &&
      (!t.resultUrl || !allUrlsToDelete.has(t.resultUrl))
    ));

    // 3. 全局 Store 与本地存储同步彻底清理
    useAppStore.getState().deleteGenerationPermanently(Array.from(allIdsToDelete), Array.from(allUrlsToDelete));

    showToast('🗑️ 已从数据库彻底删除该生成记录');
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

      const res = await fetch('/api/export-zip', {
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
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AI生图高清资产_${selectedTasks.length}张_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast(`🎉 成功打包并下载 ${selectedTasks.length} 张高清图片！`);
    } catch (err: any) {
      console.error('批量下载失败:', err);
      showToast(`❌ 批量下载失败: ${err.message || '请稍后重试'}`);
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

      const res = await fetch('/api/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: `剪映素材包_${new Date().toISOString().slice(0, 10)}`,
          images: itemsToExport
        })
      });

      if (!res.ok) throw new Error('打包服务响应异常');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `剪映素材包_${allSuccess.length}项_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast('✨ 剪映素材包已下载！解压后可直接拖入剪映草稿');
    } catch (err: any) {
      console.error('同步剪映导出失败:', err);
      showToast(`❌ 导出失败: ${err.message || '请稍后重试'}`);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedTaskIds.length === 0) return;
    if (!confirm(`确定彻底删除选中的 ${selectedTaskIds.length} 项生成记录吗？删除后将从数据库彻底永久移除。`)) return;

    const targetIds = new Set(selectedTaskIds);
    const allIdsToDelete = new Set<string>();
    const allUrlsToDelete = new Set<string>();

    mergedTasks.forEach(t => {
      if (targetIds.has(t.id) || (t.taskId && targetIds.has(t.taskId)) || (t.dbId && targetIds.has(t.dbId))) {
        if (t.id) allIdsToDelete.add(t.id);
        if (t.taskId) allIdsToDelete.add(t.taskId);
        if (t.dbId) allIdsToDelete.add(t.dbId);
        if (t.resultUrl) allUrlsToDelete.add(t.resultUrl);
      }
    });
    targetIds.forEach(id => allIdsToDelete.add(id));

    // 1. 后端批量物理删库
    try {
      await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(allIdsToDelete),
          urls: Array.from(allUrlsToDelete)
        })
      });
    } catch (e) {}

    // 2. 本地 DB 状态过滤
    setDbTasks(prev => prev.filter(t => 
      !allIdsToDelete.has(t.id) && 
      (!t.taskId || !allIdsToDelete.has(t.taskId)) &&
      (!t.resultUrl || !allUrlsToDelete.has(t.resultUrl))
    ));

    // 3. 全局 Store 与本地存储同步彻底清理
    useAppStore.getState().deleteGenerationPermanently(Array.from(allIdsToDelete), Array.from(allUrlsToDelete));

    const count = targetIds.size;
    setSelectedTaskIds([]);
    setIsBatchMode(false);
    showToast(`🗑️ 已成功从数据库批量删除 ${count} 条生成记录`);
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

    // 1. 发起后端数据库一键清理
    try {
      await fetch('/api/tasks?clearFailed=true', { method: 'DELETE' });
    } catch (e) {}

    // 2. 本地 DB 状态过滤，只保留成功的任务
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
    if (!confirm('确定从本地商品库中移除该商品吗？')) return;
    try {
      await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('删除商品失败:', err);
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

  return (
    <div className="flex-1 h-full overflow-hidden bg-[#FAFAFC] flex flex-col select-none">
      {/* 🌟 1. Top Header Bar (胶囊标签导航 + 搜索/批量/剪映导出) */}
      <div className="h-14 px-6 lg:px-8 border-b border-slate-200/80 bg-white flex items-center justify-between flex-shrink-0 shadow-2xs">
        {/* Left: Tab Switcher (胶囊切换: 生成历史 | 主体 | 画布) */}
        <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl">
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
        <div className="flex items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 pointer-events-none text-slate-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="搜索提示词..."
              className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-100/80 focus:bg-white border border-transparent focus:border-indigo-400 text-xs text-slate-900 placeholder-slate-400 outline-none w-36 focus:w-56 transition-all shadow-2xs"
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
                <div className="flex items-center gap-2 animate-fade-in">
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

      {/* 🌟 2. Sub Filter Toolbar (图片 | 视频 | 音频 | 文档 + 筛选/时间/排序下拉，严格对照图1) */}
      {activeTab === 'history' && (
        <div className="px-6 lg:px-8 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between flex-shrink-0 text-xs">
          {/* Media Types */}
          <div className="flex items-center gap-1">
            {[
              { id: 'image', label: '图片' },
              { id: 'video', label: '视频' },
              { id: 'audio', label: '音频' },
              { id: 'doc', label: '文档' }
            ].map(m => {
              const isActive = mediaCategory === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMediaCategory(m.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-slate-100 text-slate-900 font-bold border border-slate-200/80 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Filters & Sort */}
          <div className="flex items-center gap-2.5">
            {/* 筛选下拉 */}
            <div className="relative flex items-center">
              <select
                value={taskTypeFilter}
                onChange={e => setTaskTypeFilter(e.target.value as any)}
                className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium outline-none cursor-pointer text-xs"
              >
                <option value="all">筛选: 全部</option>
                <option value="text2img">文生图</option>
                <option value="img2img">垫图参考</option>
                <option value="buyer_show">京东工坊</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
            </div>

            {/* 时间下拉 */}
            <div className="relative flex items-center">
              <select
                value={timeFilter}
                onChange={e => setTimeFilter(e.target.value as any)}
                className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium outline-none cursor-pointer text-xs"
              >
                <option value="all">时间: 全部</option>
                <option value="today">今天</option>
                <option value="yesterday">昨天</option>
                <option value="7days">近 7 天</option>
                <option value="30days">近 30 天</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 pointer-events-none" />
            </div>

            {/* 排序下拉 */}
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="px-2.5 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center gap-1 font-medium cursor-pointer transition-colors text-xs"
            >
              <ArrowUpDown className="w-3 h-3 text-slate-400" />
              <span>排序: {sortOrder === 'desc' ? '最新优先' : '最早优先'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 🌟 3. Main Gallery / Content Area (多列自适应画廊，严格对照图1) */}
      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6">
        {/* TAB 1: 生成历史 */}
        {activeTab === 'history' && (
          <div className="space-y-8">
            {mergedTasks.length === 0 ? (
              <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-300">
                  <ImageIcon className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-slate-700 text-sm">
                    {mediaCategory === 'video' ? '暂无生成视频资产' : mediaCategory === 'audio' ? '暂无音频资产' : mediaCategory === 'doc' ? '暂无文档资产' : '暂无生成历史资产'}
                  </span>
                  <p className="text-xs text-slate-500">在工作区生成的商用美图与视频将自动在此沉淀归档</p>
                </div>
                <button
                  onClick={() => setCurrentView('hub')}
                  className="mt-2 px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-black transition-all shadow-sm cursor-pointer"
                >
                  去灵感大厅生成 ➔
                </button>
              </div>
            ) : (
              <>
                {/* 1. 今天 分组 */}
                {groupedBatches.today.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                      今天
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
                      {groupedBatches.today.map(batch => renderBatchCard(batch))}
                    </div>
                  </div>
                )}

                {/* 2. 昨天 分组 */}
                {groupedBatches.yesterday.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                      昨天
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
                      {groupedBatches.yesterday.map(batch => renderBatchCard(batch))}
                    </div>
                  </div>
                )}

                {/* 3. 更早 分组 */}
                {groupedBatches.earlier.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                      更早
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
                      {groupedBatches.earlier.map(batch => renderBatchCard(batch))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 2: 商品主体 / 素材库 */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                已在本地留存的电商商品素材 ({products.length})
              </span>
              <button
                onClick={onEnterBuyerShow}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>+ 采集新商品</span>
              </button>
            </div>

            {products.length === 0 ? (
              <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-3 bg-white rounded-3xl border border-slate-200/80">
                <ShoppingBag className="w-10 h-10 opacity-30" />
                <span className="font-bold text-slate-600 text-sm">暂无商品素材资产</span>
                <span className="text-xs text-slate-500">在工坊采集过的京东/淘宝商品将永久保存在此，无需重复消耗 API 额度</span>
                <button
                  onClick={onEnterBuyerShow}
                  className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all cursor-pointer"
                >
                  去采集商品 ➔
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map(prod => {
                  let imgCount = 0;
                  try {
                    const parsed = typeof prod.detailUrls === 'string' ? JSON.parse(prod.detailUrls) : (prod.detailUrls || []);
                    imgCount = (prod.picUrl ? 1 : 0) + parsed.length;
                  } catch (e) {
                    imgCount = prod.picUrl ? 1 : 0;
                  }

                  return (
                    <div
                      key={prod.id}
                      className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between space-y-3 group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 relative">
                          {prod.picUrl ? (
                            <img src={prod.picUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <FileImage className="w-6 h-6 text-slate-300 absolute inset-0 m-auto" />
                          )}
                          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-mono text-center py-0.5">
                            {imgCount} 张图
                          </span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug mb-1">
                            {prod.title || '未命名商品'}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                            {prod.platform === 'taobao' ? (
                              <span className="px-1.5 py-0.2 rounded bg-orange-50 text-orange-600 border border-orange-100 flex items-center gap-0.5 font-bold">
                                <TaobaoIcon className="w-3 h-3" /> 淘宝
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded bg-red-50 text-red-600 border border-red-100 flex items-center gap-0.5 font-bold">
                                <JdIcon className="w-3 h-3" /> 京东
                              </span>
                            )}
                            <span className="truncate">ID: {prod.itemId}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                        <span>{new Date(prod.createdAt).toLocaleDateString()}</span>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => handleDeleteProduct(prod.id, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="删除商品"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleLoadProduct(prod)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer text-xs"
                          >
                            <span>载入工坊</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: 风格配方库 */}
        {activeTab === 'recipes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                已沉淀的品类拍摄架构与视觉提示词配方 ({recipes.length})
              </span>
              <button
                onClick={() => setIsExtractModalOpen(true)}
                className="text-xs text-pink-600 hover:text-pink-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+ 进行品类架构推理</span>
              </button>
            </div>

            {recipes.length === 0 ? (
              <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-3 bg-white rounded-3xl border border-slate-200/80">
                <Sparkles className="w-10 h-10 text-pink-400 opacity-40" />
                <span className="font-bold text-slate-700 text-sm">暂无品类架构</span>
                <span className="text-xs text-slate-500">上传品类样张或输入社媒链接，AI 将自动解构空间光影并沉淀为专属架构</span>
                <button
                  onClick={() => setIsExtractModalOpen(true)}
                  className="mt-2 px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-bold hover:bg-pink-700 transition-all cursor-pointer"
                >
                  ✨ 立即推理第一条架构
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recipes.map(recipe => (
                  <div
                    key={recipe.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-purple-300 hover:shadow-md transition-all flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {recipe.coverUrl ? (
                          <img src={recipe.coverUrl} alt="" className="w-10 h-10 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 font-bold flex-shrink-0">
                            🎨
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{recipe.name}</h4>
                          <span className="text-[10px] text-purple-600 font-medium truncate block">
                            {recipe.tag || '自定义专属配方'}
                          </span>
                        </div>
                      </div>

                      <span className="text-[9px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-bold border border-purple-100 flex-shrink-0">
                        {recipe.category || '自定'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-h-20 overflow-y-auto">
                      {recipe.promptSnippet}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                      <span>{new Date(recipe.createdAt).toLocaleDateString()}</span>

                      <div className="flex items-center gap-1.5">
                        {/* ✏️ 编辑 */}
                        <button
                          onClick={() => setEditingRecipe({ ...recipe })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          title="修改配方名称与提示词"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* 🗑️ 删除 */}
                        <button
                          onClick={(e) => handleDeleteRecipe(recipe.id, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="删除配方"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(recipe.promptSnippet);
                            setCopiedId(recipe.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copiedId === recipe.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>复制</span>
                        </button>
                        <button
                          onClick={() => handleApplyRecipe(recipe)}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                        >
                          <span>应用</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Style Extract Modal */}
      <StyleExtractModal
        isOpen={isExtractModalOpen}
        onClose={() => setIsExtractModalOpen(false)}
        onRecipeCreated={(newRecipe) => {
          setRecipes(prev => [newRecipe, ...prev]);
        }}
      />

      {/* 🌟 编辑/新建配方模态框 */}
      {editingRecipe && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>{editingRecipe.isNew ? '新建自定义配方' : '编辑与修改品类配方'}</span>
              </h3>
              <button 
                onClick={() => setEditingRecipe(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">配方名称：</label>
                <input
                  type="text"
                  value={editingRecipe.name}
                  onChange={e => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                  placeholder="例如：小红书爆款复古暖光桌搭"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold outline-none focus:bg-white focus:border-indigo-500 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">归属行业品类：</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCreatingCategory(!isCreatingCategory)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{isCreatingCategory ? '选择已有' : '+ 新建品类'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCategoryManagerOpen(true)}
                        className="text-[10px] text-slate-500 hover:text-red-600 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                        title="管理与删除品类（包括系统内置与自定义分类）"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>管理/删除</span>
                      </button>
                    </div>
                  </div>

                  {isCreatingCategory ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        placeholder="如：⛺ 户外露营"
                        className="flex-1 px-2.5 py-1.5 rounded-xl bg-white border border-indigo-300 text-xs font-bold outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleCreateCategoryInAssetModal}
                        className="px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs cursor-pointer shadow-xs"
                      >
                        确定
                      </button>
                    </div>
                  ) : (
                    <select
                      value={editingRecipe.category || 'general'}
                      onChange={e => {
                        if (e.target.value === '__NEW__') {
                          setIsCreatingCategory(true);
                        } else if (e.target.value === '__MANAGE__') {
                          setIsCategoryManagerOpen(true);
                        } else {
                          setEditingRecipe({ ...editingRecipe, category: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:bg-white focus:border-indigo-500 font-medium text-slate-900 cursor-pointer"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                      <option value="__NEW__">➕ 自定义新建品类...</option>
                      <option value="__MANAGE__">⚙️ 管理 / 删除已有品类 (包括系统内置)...</option>
                    </select>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">场景特色标签：</label>
                  <input
                    type="text"
                    value={editingRecipe.tag || ''}
                    onChange={e => setEditingRecipe({ ...editingRecipe, tag: e.target.value })}
                    placeholder="如：极简原木 · 自然窗光"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:bg-white focus:border-indigo-500 text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">提示词框架与光影规则 (Prompt Recipe)：</label>
                <textarea
                  rows={4}
                  value={editingRecipe.promptSnippet}
                  onChange={e => setEditingRecipe({ ...editingRecipe, promptSnippet: e.target.value })}
                  placeholder="描述镜头景别、光线类型、真实生活质感、背景要求等..."
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono leading-relaxed outline-none focus:bg-white focus:border-indigo-500 text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setEditingRecipe(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSaveEditedRecipe}
                disabled={isUpdatingRecipe}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isUpdatingRecipe ? '保存中...' : '确认保存配方'}
              </button>
            </div>
          </div>
        </div>
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

  // 🌟 渲染批次卡片 (单张直接渲染单卡，多张折叠为堆叠批次卡片，支持原地展开/收起)
  function renderBatchCard(batch: AssetTaskBatch) {
    if (batch.tasks.length === 1) {
      return renderTaskCard(batch.tasks[0]);
    }

    const isExpanded = Boolean(expandedBatchIds[batch.batchId]);
    const primaryTask = batch.tasks[0];
    const isAllSelected = batch.tasks.every(t => selectedTaskIds.includes(t.id));
    const isSomeSelected = batch.tasks.some(t => selectedTaskIds.includes(t.id));
    const isVid = batch.tasks.some(t => t.mediaType === 'video' || t.resultUrl?.includes('.mp4'));

    if (isExpanded) {
      return (
        <div 
          key={batch.batchId} 
          className="col-span-full p-4.5 rounded-3xl bg-slate-50 border border-slate-200/90 shadow-sm space-y-3.5 animate-fade-in"
        >
          {/* Expanded Batch Header Bar */}
          <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-200/70">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="px-2.5 py-1 rounded-xl bg-indigo-600 text-white text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-2xs">
                <Layers className="w-3.5 h-3.5" />
                <span>{batch.tasks.length} 张同批任务</span>
              </span>
              <span className="text-xs font-bold text-slate-800 truncate" title={batch.prompt}>
                {batch.prompt || batch.title || '批量生成任务'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono shrink-0 hidden sm:inline">
                {formatDisplayModel(batch.model, isVid)}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setQuickPrompt(batch.prompt);
                  useAppStore.getState().setCurrentView('hub');
                  showToast('✨ 已复用提示词');
                }}
                className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="复用提示词前往创作"
              >
                <RotateCw className="w-3 h-3 text-slate-500" />
                <span>复用</span>
              </button>
              <button
                type="button"
                onClick={(e) => handleDeleteBatch(batch, e)}
                className="p-1.5 rounded-xl bg-white hover:bg-red-50 border border-slate-200 text-slate-400 hover:text-red-600 transition-colors cursor-pointer shadow-2xs"
                title="删除整批记录"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setExpandedBatchIds(prev => ({
                    ...prev,
                    [batch.batchId]: false
                  }));
                }}
                className="px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-indigo-100"
              >
                <span>收起</span>
                <ChevronDown className="w-3.5 h-3.5 rotate-180" />
              </button>
            </div>
          </div>

          {/* Sub-grid of cards in this batch */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4">
            {batch.tasks.map(task => renderTaskCard(task))}
          </div>
        </div>
      );
    }

    // Folded / Stacked Batch Card
    const coverUrl = primaryTask?.resultUrl || batch.tasks.find(t => t.resultUrl)?.resultUrl;
    const isCoverVideo = primaryTask?.mediaType === 'video' || coverUrl?.includes('.mp4');

    return (
      <div
        key={batch.batchId}
        onClick={() => {
          if (isBatchMode) {
            if (isAllSelected) {
              const batchTaskIds = new Set(batch.tasks.map(t => t.id));
              setSelectedTaskIds(prev => prev.filter(id => !batchTaskIds.has(id)));
            } else {
              const newIds = batch.tasks.map(t => t.id);
              setSelectedTaskIds(prev => Array.from(new Set([...prev, ...newIds])));
            }
          } else {
            setExpandedBatchIds(prev => ({
              ...prev,
              [batch.batchId]: true
            }));
          }
        }}
        className={`group relative rounded-xl sm:rounded-2xl bg-slate-100 border transition-all duration-200 cursor-pointer aspect-square flex flex-col justify-between shadow-2xs hover:shadow-xl hover:-translate-y-1 select-none ${
          isAllSelected
            ? 'ring-2 ring-indigo-600 border-indigo-500'
            : 'border-slate-200/80 hover:border-indigo-300'
        }`}
      >
        {/* 🌟 拟物多层堆叠背景 (Stack Layer Effect) */}
        <div className="absolute -top-1 -right-1 inset-0 bg-slate-200/90 rounded-xl sm:rounded-2xl -z-10 border border-slate-300/60 shadow-xs pointer-events-none group-hover:-top-2 group-hover:-right-2 transition-all duration-200" />
        <div className="absolute -top-2 -right-2 inset-0 bg-slate-300/60 rounded-xl sm:rounded-2xl -z-20 border border-slate-300/40 pointer-events-none group-hover:-top-3.5 group-hover:-right-3.5 transition-all duration-200" />

        {/* Top-left: Selection or Batch Badge */}
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5">
          {isBatchMode ? (
            <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all shadow-xs ${
              isAllSelected ? 'bg-indigo-600 text-white' : isSomeSelected ? 'bg-indigo-100 text-indigo-700 border border-indigo-400' : 'bg-white/90 border border-slate-300'
            }`}>
              {isAllSelected ? <Check className="w-3 h-3 stroke-[3]" /> : isSomeSelected ? <div className="w-2 h-2 bg-indigo-600 rounded-xs" /> : null}
            </div>
          ) : (
            <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-white text-[10px] font-mono font-bold flex items-center gap-1 shadow-md">
              <Layers className="w-3 h-3 text-indigo-400" />
              <span>{batch.tasks.length} 张</span>
            </span>
          )}
        </div>

        {/* Top-right Model Badge */}
        <div className="absolute top-2 right-2 z-20 pointer-events-none group-hover:opacity-0 transition-opacity duration-200">
          <span className="px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-xs text-white text-[9px] font-mono font-medium shadow-xs">
            {formatDisplayModel(batch.model, isVid)}
          </span>
        </div>

        {/* Cover Media */}
        <div className="w-full h-full relative overflow-hidden rounded-xl sm:rounded-2xl bg-slate-100 flex items-center justify-center">
          {coverUrl ? (
            isCoverVideo ? (
              <video 
                src={coverUrl} 
                muted 
                loop 
                playsInline 
                className="w-full h-full object-cover bg-black"
              />
            ) : (
              <img 
                src={coverUrl} 
                alt="" 
                loading="lazy" 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
              />
            )
          ) : (
            <AIGeneratingCard task={primaryTask} isVideo={isCoverVideo} />
          )}

          {/* Hover Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-between z-30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-indigo-300 font-bold flex items-center gap-1">
                <Layers className="w-3 h-3" />
                <span>同一批生成 · 共 {batch.tasks.length} 张</span>
              </span>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] text-white/95 line-clamp-2 leading-tight">
                {batch.prompt || '批量生成'}
              </p>
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedBatchIds(prev => ({
                      ...prev,
                      [batch.batchId]: true
                    }));
                  }}
                  className="flex-1 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold text-center flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                >
                  <span>展开查看 ({batch.tasks.length})</span>
                  <ChevronDown className="w-3 h-3 -rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDeleteBatch(batch, e)}
                  className="p-1 rounded-lg bg-white/20 hover:bg-red-600 text-white text-[10px] transition-colors cursor-pointer"
                  title="删除整批"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 渲染单张生图卡片
  function renderTaskCard(task: any) {
    const isSelected = selectedTaskIds.includes(task.id);
    const isSuccess = Boolean(task.resultUrl);
    const isRunning = (task.status === 'IN_PROGRESS' || task.status === 'PENDING') && !task.resultUrl;
    const isFailed = task.status === 'FAILURE' && !task.resultUrl;

    return (
      <div
        key={task.id}
        onClick={() => {
          if (isBatchMode) {
            if (isSelected) {
              setSelectedTaskIds(prev => prev.filter(id => id !== task.id));
            } else {
              setSelectedTaskIds(prev => [...prev, task.id]);
            }
          } else if (isSuccess) {
            const isVid = task.mediaType === 'video' || (task.resultUrl && (task.resultUrl.includes('.mp4') || task.resultUrl.includes('video')));
            setPreviewTask({
              id: task.id,
              dbId: task.dbId,
              taskId: task.taskId,
              title: task.title || (task.prompt ? (task.prompt.slice(0, 24) + '...') : (isVid ? '历史生成视频' : '历史生成图片')),
              prompt: task.prompt,
              status: 'SUCCESS',
              resultUrl: task.resultUrl,
              model: task.model || (isVid ? 'doubao-seedance-2.5' : 'gpt-image-2'),
              mediaType: isVid ? 'video' : 'image',
              size: task.size || '3:4',
              quality: task.quality || (isVid ? '720P' : '2K'),
              videoResolution: task.videoResolution || (isVid ? (task.quality || '720P') : undefined),
              videoDuration: task.videoDuration,
              useReferenceImage: false,
              progress: '100%',
              createdAt: task.createdAt ? new Date(task.createdAt).getTime() : Date.now()
            });
          }
        }}
        className={`group relative rounded-xl sm:rounded-2xl overflow-hidden bg-slate-100 border transition-all duration-200 cursor-pointer aspect-square flex flex-col justify-between shadow-2xs hover:shadow-lg hover:-translate-y-0.5 select-none ${
          isSelected 
            ? 'ring-2 ring-indigo-600 border-indigo-500' 
            : 'border-slate-200/80 hover:border-slate-300'
        }`}
      >
        {/* Top-left: Selection Checkbox */}
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1">
          {isBatchMode && (
            <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all shadow-xs ${
              isSelected ? 'bg-indigo-600 text-white' : 'bg-white/90 border border-slate-300'
            }`}>
              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
          )}
        </div>

        {/* Top-right Model Tag (鼠标悬停时自动隐去，避免遮挡操作按钮) */}
        {!isRunning && !isBatchMode && (
          <div className="absolute top-2 right-2 z-20 pointer-events-none group-hover:opacity-0 transition-opacity duration-200">
            <span className="px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-xs text-white text-[9px] font-mono font-medium shadow-xs">
              {formatDisplayModel(task.model, task.mediaType === 'video' || task.resultUrl?.includes('.mp4'))}
            </span>
          </div>
        )}

        {/* Top-left Video Duration Badge */}
        {!isRunning && !isBatchMode && (task.mediaType === 'video' || task.resultUrl?.includes('.mp4')) && (
          <div className="absolute top-2 left-2 z-20 pointer-events-none group-hover:opacity-0 transition-opacity duration-200">
            <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-sky-300 text-[9px] font-mono font-bold flex items-center gap-1 shadow-xs">
              <Film className="w-2.5 h-2.5" />
              <span>{task.videoDuration ? `${task.videoDuration}s` : '视频'}</span>
            </span>
          </div>
        )}

        {/* Card Main Media */}
        <div className="w-full h-full relative overflow-hidden bg-slate-100 flex items-center justify-center">
          {isSuccess ? (
            (task.mediaType === 'video' || task.resultUrl?.includes('.mp4')) ? (
              <div className="w-full h-full relative group/vid">
                <video 
                  src={task.resultUrl} 
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover bg-black"
                  onMouseEnter={e => (e.target as HTMLVideoElement).play().catch(() => {})}
                  onMouseLeave={e => (e.target as HTMLVideoElement).pause()}
                />
                {/* 居中大播放按钮图标 */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity">
                  <div className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-xs text-white flex items-center justify-center shadow-md">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                </div>
              </div>
            ) : (
              <img 
                src={task.resultUrl} 
                alt="" 
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
              />
            )
          ) : isRunning ? (
            <AIGeneratingCard 
              task={task} 
              isVideo={task.mediaType === 'video' || task.resultUrl?.includes('.mp4')} 
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 p-4 text-center text-red-500">
              <AlertCircle className="w-6 h-6" />
              <span className="text-[10px] font-bold">{task.mediaType === 'video' ? '视频生成失败' : '生图失败'}</span>
              <span className="text-[9px] text-slate-400 line-clamp-1">{task.failReason || '网络异常'}</span>
            </div>
          )}

          {/* Hover Overlay Toolbar (When Success) */}
          {isSuccess && !isBatchMode && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-between z-30">
              <div className="flex items-center justify-between">
                {/* 悬停时左上角多选框 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTaskIds(prev => isSelected ? prev.filter(id => id !== task.id) : [...prev, task.id]);
                    setIsBatchMode(true);
                  }}
                  className="w-6 h-6 rounded-md bg-black/50 hover:bg-white hover:text-black text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                  title="多选此项"
                >
                  <Check className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-400' : 'text-white'}`} />
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const isVid = task.mediaType === 'video' || task.resultUrl?.includes('.mp4');
                      const a = document.createElement('a');
                      a.href = task.resultUrl;
                      a.download = `beikeyuntu_${isVid ? 'video' : 'image'}_${Date.now()}.${isVid ? 'mp4' : 'png'}`;
                      a.target = '_blank';
                      a.click();
                    }}
                    className="w-6 h-6 rounded-md bg-black/60 hover:bg-white hover:text-black text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                    title={task.mediaType === 'video' ? "下载高清视频" : "下载原图"}
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteTask(task, e)}
                    className="w-6 h-6 rounded-md bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                    title="删除记录"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Bottom Info & Action */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-white/90 line-clamp-2 leading-snug font-sans">
                  {task.prompt}
                </p>

                <div className="flex items-center gap-1 pt-1">
                  <button
                    onClick={(e) => handleRegenerate(task, e)}
                    className="flex-1 py-1 rounded-lg bg-white/20 hover:bg-white/40 text-white text-[10px] font-bold backdrop-blur-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>再做一张</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(task.prompt);
                      setCopiedId(task.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    className="px-2 py-1 rounded-lg bg-white/20 hover:bg-white/40 text-white text-[10px] font-bold backdrop-blur-xs flex items-center justify-center transition-colors cursor-pointer"
                    title="复制提示词"
                  >
                    {copiedId === task.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Hover Overlay Toolbar (When Running / Failed) */}
          {!isSuccess && !isBatchMode && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between z-10">
              <div className="flex items-center justify-end">
                <button
                  onClick={(e) => handleDeleteTask(task, e)}
                  className="w-7 h-7 rounded-lg bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                  title="删除/清除此记录"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1 pt-1">
                {task.prompt && (
                  <button
                    onClick={(e) => handleRegenerate(task, e)}
                    className="flex-1 py-1 rounded-lg bg-white/90 hover:bg-white text-slate-900 text-[10px] font-bold shadow-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>重试生成</span>
                  </button>
                )}
                <button
                  onClick={(e) => handleDeleteTask(task, e)}
                  className="px-2 py-1 rounded-lg bg-red-500/90 hover:bg-red-600 text-white text-[10px] font-bold shadow-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  title="删除记录"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>删除</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
