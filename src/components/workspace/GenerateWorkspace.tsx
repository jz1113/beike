'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useAppStore, GenerationTask, ChatSession } from '@/store/useAppStore';
import { getModelIcon } from '@/components/common/ModelIcons';
import { normalizeImageUrlToStandardJpg, getAspectRatioFromSize, formatDisplayModel } from '@/lib/drawing';
import { getClientStorageHeaders } from '@/lib/storage';
import { recordModelUsage } from '@/lib/usageTracker';
import PromptActionBar from '@/components/hub/PromptActionBar';
import AIGeneratingCard from '@/components/common/AIGeneratingCard';
import { 
  SquarePen, 
  MessageSquare, 
  Trash2, 
  Search, 
  ChevronDown, 
  ChevronUp,
  FolderArchive, 
  Maximize2, 
  Download, 
  Copy, 
  Check, 
  RotateCcw, 
  Info, 
  Sparkles, 
  Loader2, 
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
  MoreHorizontal,
  Pin,
  Pencil,
  Edit3,
  Plus,
  Layers,
  Image as ImageIcon,
  ImagePlus,
  Film,
  Video
} from 'lucide-react';

interface Props {
  onOpenProductVault?: () => void;
  onOpenPromptVault?: () => void;
  onOpenSettings?: () => void;
}

// 🌟 健壮的会话缩略图组件 (支持图片、视频、失效降级至优雅图标，杜绝浏览器图片裂开错误)
function SessionThumbnail({ sess, isSelected }: { sess: ChatSession; isSelected: boolean }) {
  const [imgError, setImgError] = useState(false);
  const successTask = sess.tasks?.find((t: GenerationTask) => t.status === 'SUCCESS' && t.resultUrl);
  const mediaUrl = successTask?.resultUrl || sess.tasks?.find((t: GenerationTask) => Boolean(t.referenceImageUrl))?.referenceImageUrl;
  const isVideo = Boolean(
    mediaUrl && (
      mediaUrl.endsWith('.mp4') ||
      mediaUrl.includes('.mp4') ||
      mediaUrl.includes('video') ||
      successTask?.mediaType === 'video' ||
      successTask?.model?.toLowerCase().includes('seedance') ||
      successTask?.model?.toLowerCase().includes('veo') ||
      successTask?.model?.toLowerCase().includes('kling')
    )
  );

  if (mediaUrl && !imgError) {
    if (isVideo) {
      return (
        <div className="relative w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200/80 shadow-2xs bg-slate-900 flex items-center justify-center">
          <video
            src={mediaUrl}
            muted
            playsInline
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center pointer-events-none">
            <Film className="w-3 h-3 text-white/90" />
          </div>
          {sess.isPinned && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-bl-sm z-10" />
          )}
        </div>
      );
    }

    return (
      <div className="relative w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200/80 shadow-2xs bg-slate-100">
        <img
          src={mediaUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
        {sess.isPinned && (
          <div className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-bl-sm z-10" />
        )}
      </div>
    );
  }

  return (
    <div className="w-7 h-7 rounded-lg bg-slate-100/90 flex items-center justify-center flex-shrink-0 text-slate-500">
      <MessageSquare className={`w-3.5 h-3.5 ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-400'}`} />
    </div>
  );
}

export default function GenerateWorkspace({
  onOpenProductVault,
  onOpenPromptVault,
  onOpenSettings
}: Props) {
  const {
    sessions,
    currentSessionId,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    pinSession,
    renameTask,
    hubGenerations,
    setPreviewTask,
    setQuickPrompt,
    setQuickModel,
    setQuickQuality,
    addHubGeneration,
    updateHubGeneration,
    deleteHubGeneration,
    syncDatabaseTasks
  } = useAppStore();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // 会话菜单与重命名状态
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionTitle, setEditSessionTitle] = useState('');

  // 绘画任务操作状态 (卡片更多菜单与重命名)
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [openMenuBatchId, setOpenMenuBatchId] = useState<string | null>(null);

  // 🌟 顶部筛选条件与下拉菜单状态
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'progress' | 'failure'>('all');

  const [showTimeMenu, setShowTimeMenu] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  // 🌟 多图任务折叠堆叠状态管理
  const [unfoldedBatchIds, setUnfoldedBatchIds] = useState<Set<string>>(new Set());
  const [hoveredBatchId, setHoveredBatchId] = useState<string | null>(null);

  // 🌟 吐司提示状态
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const menuRef = useRef<HTMLDivElement>(null);
  const headerFilterRef = useRef<HTMLDivElement>(null);

  // 🌟 从持久化数据库 /api/tasks 自动同步历史任务 (含视频与图片，确保刷新/切换会话不丢记录)
  useEffect(() => {
    const loadAndSyncDbTasks = async () => {
      try {
        const res = await fetch('/api/tasks').catch(() => null);
        if (res && res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.success && Array.isArray(data.tasks)) {
            const formatted: GenerationTask[] = data.tasks.map((t: any) => {
              const isVideo = t.mediaType === 'video' || t.resultUrl?.includes('.mp4') || (t.model && (t.model.toLowerCase().includes('seedance') || t.model.toLowerCase().includes('veo') || t.model.toLowerCase().includes('kling') || t.model.toLowerCase().includes('minimax') || t.model.toLowerCase().includes('h3') || t.model.toLowerCase().includes('hailuo') || t.model.toLowerCase().includes('wan') || t.model.toLowerCase().includes('vidu') || t.model.toLowerCase().includes('luma') || t.model.toLowerCase().includes('hunyuan')));
              return {
                id: t.id,
                taskId: t.taskId,
                title: t.prompt?.slice(0, 25) || (isVideo ? 'AI 视频创作' : 'AI 生图'),
                prompt: t.prompt,
                model: t.model,
                mediaType: isVideo ? 'video' : 'image',
                size: t.size || (isVideo ? '16:9' : '3:4'),
                quality: t.quality || (isVideo ? '720P' : 'high'),
                status: t.status || 'SUCCESS',
                resultUrl: t.resultUrl,
                failReason: t.failReason,
                progress: t.status === 'SUCCESS' ? '100%' : (t.status === 'FAILURE' ? '0%' : '65%'),
                createdAt: new Date(t.createdAt).getTime(),
                useReferenceImage: false
              };
            });
            syncDatabaseTasks(formatted);
          }
        }
      } catch (err) {
        console.warn('[GenerateWorkspace] 自动同步数据库任务失败:', err);
      }
    };

    loadAndSyncDbTasks();
  }, [syncDatabaseTasks]);

  // 点击外部关闭更多操作菜单与筛选下拉
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuSessionId(null);
      }
      if (headerFilterRef.current && !headerFilterRef.current.contains(e.target as Node)) {
        setShowTimeMenu(false);
        setShowModeMenu(false);
        setShowStatusMenu(false);
      }
      setOpenMenuTaskId(null);
      setOpenMenuBatchId(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 🌟 支持【全部生成历史】与【指定会话】切换 (会话删除绝不影响生成历史与资产安全)
  const isAllHistory = currentSessionId === '__all__';
  const activeSession = isAllHistory ? null : (sessions.find(s => s.id === currentSessionId) || sessions[0]);
  const taskList = useMemo(() => {
    const rawTasks = isAllHistory ? hubGenerations : (activeSession?.tasks || []);
    const map = new Map<string, GenerationTask>();
    rawTasks.forEach(t => {
      if (t && (t.id || t.taskId)) {
        const key = t.id || t.taskId!;
        if (!map.has(key)) {
          map.set(key, t);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
      const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });
  }, [isAllHistory, hubGenerations, activeSession]);

  // 记录正在提交/轮询的任务 ID，避免重复请求
  const submittingTaskIdsRef = useRef<Set<string>>(new Set());
  const pollCountsRef = useRef<Record<string, number>>({});

  // 🌟 全局自愈式任务引擎：自动扫描未提交的任务进行提交，并对进行中的任务执行平滑轮询
  useEffect(() => {
    // 1. 扫描未提交后端的任务 (status === IN_PROGRESS || status === 'IDLE' || !t.taskId)
    const unsubmittedTasks = taskList.filter(t => (t.status === 'IN_PROGRESS' || t.status === 'IDLE' || !t.status) && !t.taskId && !t.resultUrl);
    unsubmittedTasks.forEach(async (t) => {
      if (submittingTaskIdsRef.current.has(t.id)) return;
      submittingTaskIdsRef.current.add(t.id);

      try {
        const localUrl = typeof window !== 'undefined' ? (localStorage.getItem('ai_base_url') || undefined) : undefined;
        const localKey = typeof window !== 'undefined' ? (localStorage.getItem('ai_api_key') || undefined) : undefined;
        const isVideoTask = t.mediaType === 'video' || 
          t.model?.toLowerCase().includes('seedance') || 
          t.model?.toLowerCase().includes('veo') || 
          t.model?.toLowerCase().includes('kling') || 
          t.model?.toLowerCase().includes('sora') || 
          t.model?.toLowerCase().includes('gen3') || 
          t.model?.toLowerCase().includes('minimax') || 
          t.model?.toLowerCase().includes('h3') || 
          t.model?.toLowerCase().includes('hailuo') || 
          t.model?.toLowerCase().includes('wan') || 
          t.model?.toLowerCase().includes('vidu') || 
          t.model?.toLowerCase().includes('luma') || 
          t.model?.toLowerCase().includes('hunyuan');

        console.log(`[工作台任务调度] 正在为任务 ${t.id} (${isVideoTask ? '视频生成' : '图片生成'}) 提交模型接口:`, t.prompt.slice(0, 30));
        let res: Response;
        try {
          if (isVideoTask) {
              const effectiveImgs = (Array.isArray(t.referenceImages) && t.referenceImages.length > 0)
                ? t.referenceImages.map(img => normalizeImageUrlToStandardJpg(img))
                : (t.referenceImageUrl ? [normalizeImageUrlToStandardJpg(t.referenceImageUrl)] : []);

              res = await fetch('/api/generate-video', {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  ...getClientStorageHeaders()
                },
                body: JSON.stringify({
                  prompt: t.prompt,
                  model: t.model || 'doubao-seedance-2.5',
                  duration: t.videoDuration || 5,
                  aspect_ratio: t.size || '16:9',
                  resolution: t.videoResolution || '720P',
                  ref_mode: t.videoRefMode || 'omni',
                  images: effectiveImgs,
                  first_frame_image: effectiveImgs[0] || undefined,
                  last_frame_image: effectiveImgs.length >= 2 ? effectiveImgs[effectiveImgs.length - 1] : undefined,
                  camera_motion: (t as any).cameraMotion,
                  audio: (t as any).generateAudio,
                  watermark: false,
                  customBaseUrl: localUrl,
                  customApiKey: localKey
                })
              });
          } else {
            res = await fetch('/api/generate-image', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                ...getClientStorageHeaders()
              },
              body: JSON.stringify({
                prompt: t.prompt,
                model: t.model || (t.mediaType === 'video' || t.resultUrl?.includes('.mp4') ? 'doubao-seedance-2.5' : 'gpt-image-2'),
                size: t.size || '2448x3264',
                productImageUrl: t.referenceImageUrl ? normalizeImageUrlToStandardJpg(t.referenceImageUrl) : undefined,
                referenceImageUrl: t.referenceImageUrl ? normalizeImageUrlToStandardJpg(t.referenceImageUrl) : undefined,
                referenceImages: Array.isArray(t.referenceImages) ? t.referenceImages : (Array.isArray(t.images) ? t.images : undefined),
                images: Array.isArray(t.images) ? t.images : (Array.isArray(t.referenceImages) ? t.referenceImages : undefined),
                useReferenceImage: t.useReferenceImage,
                productTitle: t.title,
                customBaseUrl: localUrl,
                customApiKey: localKey
              })
            });
          }
        } catch (networkErr: any) {
          console.warn(`[工作台任务调度] 网络连接异常:`, networkErr?.message);
          return;
        }

        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `生成任务提交失败 (HTTP ${res.status})`);
        }

        // 🌟 记录真实模型调用用量
        recordModelUsage({
          modelId: t.model || (isVideoTask ? 'doubao-seedance-2.5' : 'gpt-image-2'),
          modelName: (t as any).modelName || t.model || (isVideoTask ? '即梦 Seedance' : 'GPT Image 2'),
          provider: isVideoTask ? (t.model?.toLowerCase().includes('minimax') ? 'MiniMax' : '字节火山') : (t.model?.includes('gpt') ? 'OpenAI' : '字节火山'),
          type: isVideoTask ? 'video' : 'image',
          mediaCount: 1,
          success: true
        });

        if (data.resultUrl) {
          updateHubGeneration(t.id, {
            status: 'SUCCESS',
            progress: '100%',
            resultUrl: data.resultUrl,
            taskId: data.taskId
          });
        } else if (data.taskId) {
          updateHubGeneration(t.id, {
            status: 'IN_PROGRESS',
            progress: '25%',
            taskId: data.taskId
          });
        }
      } catch (err: any) {
        console.warn(`[工作台任务调度] 任务 ${t.id} 处理提示:`, err?.message);
        updateHubGeneration(t.id, {
          status: 'FAILURE',
          failReason: err?.message || '网络连接异常或模型接口错误'
        });
      } finally {
        submittingTaskIdsRef.current.delete(t.id);
      }
    });

    // 2. 轮询已有 taskId 但仍在进行中的任务
    const ongoingTasks = taskList.filter(t => t.status === 'IN_PROGRESS' && t.taskId && !t.resultUrl);
    if (ongoingTasks.length === 0) return;

    const progressSteps = ['35%', '50%', '65%', '78%', '88%', '94%', '97%'];

    const interval = setInterval(async () => {
      const localUrl = localStorage.getItem('ai_base_url') || '';
      const localKey = localStorage.getItem('ai_api_key') || '';

      for (const t of ongoingTasks) {
        const count = (pollCountsRef.current[t.id] || 0) + 1;
        pollCountsRef.current[t.id] = count;

        // 超时检查 (放宽至约 300 秒，为高分辨率超清渲染预留充足算力时间)
        if (count > 120) {
          updateHubGeneration(t.id, {
            status: 'FAILURE',
            failReason: '渲染超时，请点击下方重试'
          });
          continue;
        }

        // 推进平滑进度模拟
        const stepProg = progressSteps[Math.min(count - 1, progressSteps.length - 1)];
        updateHubGeneration(t.id, { progress: stepProg });

        try {
          const isVideoTask = t.mediaType === 'video' || t.model?.toLowerCase().includes('seedance') || t.model?.toLowerCase().includes('veo') || t.model?.toLowerCase().includes('kling') || t.model?.toLowerCase().includes('sora') || t.model?.toLowerCase().includes('gen3') || t.model?.toLowerCase().includes('hunyuan');
          const pollEndpoint = isVideoTask ? '/api/generate-video' : '/api/generate-image';

          const queryParams = new URLSearchParams({ taskId: t.taskId! });
          if (localUrl) queryParams.set('customBaseUrl', localUrl);
          if (localKey) queryParams.set('customApiKey', localKey);

          const res = await fetch(`${pollEndpoint}?${queryParams.toString()}`, {
            headers: getClientStorageHeaders()
          }).catch(() => null);
          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (data?.status === 'SUCCESS' && data?.resultUrl) {
              delete pollCountsRef.current[t.id];
              updateHubGeneration(t.id, {
                status: 'SUCCESS',
                resultUrl: data.resultUrl,
                progress: '100%'
              });
            } else if (data?.status === 'FAILURE') {
              delete pollCountsRef.current[t.id];
              updateHubGeneration(t.id, {
                status: 'FAILURE',
                failReason: data.failReason || '模型渲染失败'
              });
            }
          }
        } catch (e) {
          console.warn(`[工作台任务轮询] 轮询任务 ${t.id} 失败:`, e);
        }
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [taskList]);

  // 过滤后的任务列表 (支持关键词搜索、时间周期、生成模式、任务状态多维度筛选)
  const filteredTasks = taskList.filter(t => {
    // 1. 关键词搜索
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchPrompt = t.prompt && t.prompt.toLowerCase().includes(q);
      const matchTitle = t.title && t.title.toLowerCase().includes(q);
      if (!matchPrompt && !matchTitle) return false;
    }

    // 2. 时间周期筛选
    if (timeFilter !== 'all') {
      const now = Date.now();
      const createdAt = typeof t.createdAt === 'number' ? t.createdAt : new Date(t.createdAt || 0).getTime();
      const diffMs = now - createdAt;
      if (timeFilter === 'today') {
        const startOfToday = new Date().setHours(0, 0, 0, 0);
        if (createdAt < startOfToday) return false;
      } else if (timeFilter === '7days') {
        if (diffMs > 7 * 24 * 60 * 60 * 1000) return false;
      } else if (timeFilter === '30days') {
        if (diffMs > 30 * 24 * 60 * 60 * 1000) return false;
      }
    }

    // 3. 生成模式筛选 (图片 vs 视频)
    const isVideo = t.mediaType === 'video' || t.resultUrl?.includes('.mp4') || (t.model && (t.model.toLowerCase().includes('seedance') || t.model.toLowerCase().includes('veo') || t.model.toLowerCase().includes('kling') || t.model.toLowerCase().includes('minimax') || t.model.toLowerCase().includes('h3') || t.model.toLowerCase().includes('hailuo') || t.model.toLowerCase().includes('wan') || t.model.toLowerCase().includes('vidu') || t.model.toLowerCase().includes('luma') || t.model.toLowerCase().includes('hunyuan')));
    if (modeFilter === 'image' && isVideo) return false;
    if (modeFilter === 'video' && !isVideo) return false;

    // 4. 任务状态筛选
    if (statusFilter === 'success' && t.status !== 'SUCCESS') return false;
    if (statusFilter === 'progress' && t.status !== 'IN_PROGRESS') return false;
    if (statusFilter === 'failure' && t.status !== 'FAILURE') return false;

    return true;
  });

  // 🌟 核心：将任务按批次 (batchId 或相同 prompt+时间戳) 分组为独立任务行
  interface TaskBatchGroup {
    batchId: string;
    prompt: string;
    title?: string;
    model: string;
    size: string;
    quality?: string;
    referenceImageUrl?: string;
    createdAt: number;
    tasks: GenerationTask[];
  }

  const taskBatches: TaskBatchGroup[] = useMemo(() => {
    const groups: TaskBatchGroup[] = [];
    
    // 逆序排列 (最新的任务行排在最上方)
    const sorted = [...filteredTasks].reverse();

    sorted.forEach((task, idx) => {
      const isTaskVideo = task.mediaType === 'video' || task.resultUrl?.includes('.mp4') || (task.model && (task.model.toLowerCase().includes('seedance') || task.model.toLowerCase().includes('veo') || task.model.toLowerCase().includes('kling') || task.model.toLowerCase().includes('minimax') || task.model.toLowerCase().includes('h3') || task.model.toLowerCase().includes('hailuo') || task.model.toLowerCase().includes('wan') || task.model.toLowerCase().includes('vidu') || task.model.toLowerCase().includes('luma') || task.model.toLowerCase().includes('hunyuan')));

      // 匹配现有组：
      // 1. 视频与图片绝对不能混在同一组！
      // 2. 若有 batchId 则优先按 batchId 归组；
      // 3. 若无 batchId，但提示词相同且时间戳在 5 秒内，则归入同一组；
      const existing = groups.find(g => {
        const isGroupVideo = g.tasks.some(t => t.mediaType === 'video' || t.resultUrl?.includes('.mp4') || (t.model && (t.model.toLowerCase().includes('seedance') || t.model.toLowerCase().includes('veo') || t.model.toLowerCase().includes('kling') || t.model.toLowerCase().includes('minimax') || t.model.toLowerCase().includes('h3') || t.model.toLowerCase().includes('hailuo') || t.model.toLowerCase().includes('wan') || t.model.toLowerCase().includes('vidu') || t.model.toLowerCase().includes('luma') || t.model.toLowerCase().includes('hunyuan'))));
        if (isTaskVideo !== isGroupVideo) return false;

        if (task.batchId && g.batchId === task.batchId) return true;
        if (task.batchId && g.tasks.some(t => t.batchId === task.batchId)) return true;
        if (!task.batchId && g.prompt === task.prompt && Math.abs((task.createdAt || 0) - g.createdAt) < 5000) return true;
        return false;
      });

      if (existing) {
        existing.tasks.push(task);
      } else {
        const uniqueFallbackId = `batch-${task.id || task.createdAt || 0}-${idx}`;
        const taskQuality = isTaskVideo
          ? (task.quality === 'high' || !task.quality ? (task.videoResolution || '720P') : task.quality)
          : (task.quality === 'high' ? '2K' : (task.quality || '2K'));

        groups.push({
          batchId: task.batchId || uniqueFallbackId,
          prompt: task.prompt,
          title: task.title,
          model: task.model || (isTaskVideo ? 'doubao-seedance-2.5' : 'gpt-image-2'),
          size: task.size || (isTaskVideo ? '16:9' : '3:4'),
          quality: taskQuality,
          referenceImageUrl: task.referenceImageUrl,
          createdAt: task.createdAt || 0,
          tasks: [task]
        });
      }
    });

    // 🌟 核心：确保每个批次内的分镜卡片严格按照正序排列 (第 1 张 -> 第 2 张 -> 第 3 张... 第 6 张)
    groups.forEach(g => {
      g.tasks.sort((a, b) => {
        // 1. 若有显式 shotNo 则按 shotNo 升序 (1 -> 2 -> 3 -> 4 -> 5 -> 6)
        if (typeof a.shotNo === 'number' && typeof b.shotNo === 'number') {
          return a.shotNo - b.shotNo;
        }
        // 2. 若标题中含有 "第 X 张" 则提取数字进行正向升序比较
        const numA = a.title?.match(/第\s*(\d+)\s*张/)?.[1];
        const numB = b.title?.match(/第\s*(\d+)\s*张/)?.[1];
        if (numA && numB) {
          return parseInt(numA, 10) - parseInt(numB, 10);
        }
        // 3. 否则按创建时间从早到晚 (第 1 张优先) 升序排列
        const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
        const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
        return tA - tB;
      });

      // 同步组提示词为主分镜 (第 1 张) 的提示词
      if (g.tasks[0] && g.tasks[0].prompt) {
        g.prompt = g.tasks[0].prompt;
      }
    });

    return groups;
  }, [filteredTasks]);

  // 🌟 按日期（今天、昨天、更早）分组批次，严格对应参考图1的日期大标题设计
  const dateGroupedBatches = useMemo(() => {
    const groups: { dateLabel: string; batches: TaskBatchGroup[] }[] = [];
    const now = new Date();
    const todayStr = now.toDateString();
    const yDay = new Date();
    yDay.setDate(yDay.getDate() - 1);
    const yesterdayStr = yDay.toDateString();

    taskBatches.forEach(batch => {
      const d = new Date(batch.createdAt || Date.now());
      let label = '更早';
      if (d.toDateString() === todayStr) {
        label = '今天';
      } else if (d.toDateString() === yesterdayStr) {
        label = '昨天';
      } else {
        label = `${d.getMonth() + 1}月${d.getDate()}日`;
      }

      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.dateLabel === label) {
        lastGroup.batches.push(batch);
      } else {
        groups.push({ dateLabel: label, batches: [batch] });
      }
    });

    return groups;
  }, [taskBatches]);

  const handleDownloadImage = async (url: string, title?: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${title || 'beikeyuntu_ai'}_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(url, '_blank');
    }
  };

  const handleCopyPrompt = (task: GenerationTask) => {
    navigator.clipboard.writeText(task.prompt);
    setCopiedId(task.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReuseTask = (task: GenerationTask) => {
    setQuickPrompt(task.prompt);
    if (task.model) setQuickModel(task.model);
    if (task.quality) setQuickQuality((task.quality as any) || 'high');
    if (task.resultUrl) {
      useAppStore.getState().setQuickRefImage(task.resultUrl);
    }
  };

  // 失败或卡住时一键立即重试原任务
  const handleRetryTask = (task: GenerationTask) => {
    delete pollCountsRef.current[task.id];
    submittingTaskIdsRef.current.delete(task.id);
    updateHubGeneration(task.id, {
      status: 'IN_PROGRESS',
      progress: '15%',
      resultUrl: undefined,
      failReason: undefined,
      taskId: undefined
    });
  };

  // 再次生成 (使用相同提示词与配置在当前对话中发起一次新生成)
  const handleRegenerateTask = async (task: GenerationTask) => {
    const newTaskId = `hub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTask: GenerationTask = {
      ...task,
      id: newTaskId,
      taskId: undefined,
      status: 'IN_PROGRESS',
      progress: '15%',
      resultUrl: undefined,
      failReason: undefined,
      createdAt: Date.now()
    };
    addHubGeneration(newTask, false);
  };


  // 开始重命名会话
  const startRenameSession = (sessId: string, currentTitle: string) => {
    setEditingSessionId(sessId);
    setEditSessionTitle(currentTitle);
    setOpenMenuSessionId(null);
  };

  // 保存会话重命名
  const saveRenameSession = (sessId: string) => {
    if (editSessionTitle.trim()) {
      renameSession(sessId, editSessionTitle.trim());
    }
    setEditingSessionId(null);
  };

  // 开始重命名绘画任务
  const startRenameTask = (taskId: string, currentTitle: string) => {
    setEditingTaskId(taskId);
    setEditTaskTitle(currentTitle);
  };

  // 保存绘画任务重命名
  const saveRenameTask = (taskId: string) => {
    if (editTaskTitle.trim()) {
      renameTask(taskId, editTaskTitle.trim());
    }
    setEditingTaskId(null);
  };

  // 根据尺寸比例获取 CSS 类 (精准还原各比例卡片画幅)
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

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-[#F8F9FA] select-none">
      {/* 🌟 1. 左侧二级会话侧边栏 (对照图2 & 重命名菜单图: 开启创作 + 新对话 + 最近会话列表) */}
      <aside 
        className={`bg-white border-r border-slate-200/80 transition-all duration-300 flex flex-col flex-shrink-0 z-30 ${
          isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden opacity-0 border-none'
        }`}
      >
        <div className="p-4 flex flex-col h-full">
          {/* 顶部标题与收起按钮 */}
          <div className="flex items-center justify-between mb-4">
            <span className="font-bold text-slate-800 text-sm">开启创作</span>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="收起侧边栏"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* 新对话按钮 (对照图2) */}
          <button
            type="button"
            onClick={createSession}
            className="w-full py-2.5 px-3 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm text-slate-800 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer mb-2 group"
          >
            <SquarePen className="w-4 h-4 text-slate-600 group-hover:scale-110 transition-transform" />
            <span>新对话</span>
          </button>

          {/* 🌐 全部生成历史 常驻入口 (与对话记录彻底解耦，无论对话如何清理，全部历史与资产中心永久完整) */}
          <button
            type="button"
            onClick={() => switchSession('__all__')}
            className={`w-full py-2 px-3 rounded-2xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer mb-4 group ${
              isAllHistory
                ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 shadow-2xs'
                : 'bg-white border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
            }`}
            title="查看全局所有已生成的作品与历史记录"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${
                isAllHistory ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-600'
              }`}>
                <Layers className="w-3 h-3" />
              </div>
              <span className="truncate">全部生成历史</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              isAllHistory ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {hubGenerations.length}
            </span>
          </button>

          {/* 最近会话列表 (带绘画缩略图 + 悬浮 ... 菜单: 置顶、重命名、删除) */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            <div className="text-[11px] font-bold text-slate-400 px-2 py-1 flex items-center justify-between">
              <span>创作对话</span>
              <span className="text-[10px] text-slate-400 font-normal">{sessions.length} 个</span>
            </div>
            {sessions.map((sess) => {
              const isSelected = sess.id === currentSessionId;
              const isEditing = editingSessionId === sess.id;
              const isMenuOpen = openMenuSessionId === sess.id;

              // 获取该会话首张成功生成的绘画缩略图
              return (
                <div
                  key={sess.id}
                  onClick={() => switchSession(sess.id)}
                  className={`group relative w-full px-2.5 py-2 rounded-2xl text-xs flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-100 text-slate-900 font-bold shadow-xs'
                      : 'hover:bg-slate-50 text-slate-600'
                  }`}
                  title={sess.title}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                    {/* 左侧：已生成的绘画/视频缩略图或优雅图标 */}
                    <SessionThumbnail sess={sess} isSelected={isSelected} />

                    {/* 中间：标题 (支持即时重命名输入框) */}
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={editSessionTitle}
                        onChange={(e) => setEditSessionTitle(e.target.value)}
                        onBlur={() => saveRenameSession(sess.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRenameSession(sess.id);
                          if (e.key === 'Escape') setEditingSessionId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-white border border-blue-500 rounded-md px-1.5 py-0.5 text-xs text-slate-900 outline-none font-medium shadow-xs"
                      />
                    ) : (
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        {sess.isPinned && (
                          <Pin className="w-2.5 h-2.5 text-amber-500 fill-amber-500 flex-shrink-0 rotate-45" />
                        )}
                        <span className="truncate">{sess.title || '未命名对话'}</span>
                      </div>
                    )}
                  </div>

                  {/* 右侧：悬浮快捷删除 + 更多操作按钮 */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(sess.id);
                        showToast(`已删除对话「${sess.title || '未命名对话'}」`);
                      }}
                      className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                      title="删除此对话"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuSessionId(isMenuOpen ? null : sess.id);
                        }}
                        className={`p-1 rounded-lg hover:bg-slate-200/80 text-slate-400 hover:text-slate-800 transition-all cursor-pointer ${
                          isMenuOpen ? 'opacity-100 bg-slate-200/80 text-slate-800' : ''
                        }`}
                        title="更多操作"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>

                      {/* 🌟 浮动菜单 (置顶、重命名、删除) */}
                      {isMenuOpen && (
                        <div 
                          className="absolute right-0 top-full mt-1 w-32 rounded-2xl bg-white border border-slate-200 shadow-xl p-1.5 z-50 animate-fade-in space-y-0.5 text-left"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* 置顶 */}
                          <button
                            type="button"
                            onClick={() => {
                              pinSession(sess.id);
                              setOpenMenuSessionId(null);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Pin className="w-3.5 h-3.5 text-slate-500 rotate-45" />
                            <span>{sess.isPinned ? '取消置顶' : '置顶'}</span>
                          </button>

                          {/* 重命名 */}
                          <button
                            type="button"
                            onClick={() => startRenameSession(sess.id, sess.title)}
                            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-500" />
                            <span>重命名</span>
                          </button>

                          {/* 删除 */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(sess.id);
                              setOpenMenuSessionId(null);
                              showToast(`已删除对话「${sess.title || '未命名对话'}」`);
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl hover:bg-red-50 text-red-600 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            <span>删除</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* 🌟 2. 右侧核心生成画布与主工作区 */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* 全局浮动操作提示 (Toast) */}
        {toastMsg && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold shadow-2xl border border-white/10 animate-fade-in flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* 顶部过滤筛选工具栏 */}
        <header className="h-14 px-6 border-b border-slate-200/60 bg-white/80 backdrop-blur-md flex items-center justify-between flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer mr-2"
                title="展开侧边栏"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            {/* 视图指示器与会话快速删除 */}
            <div className="hidden sm:flex items-center gap-2 mr-2">
              <span className="font-bold text-xs text-slate-800 truncate max-w-[160px]">
                {isAllHistory ? '🌐 全部生成历史' : (activeSession?.title || '未命名对话')}
              </span>
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {taskList.length}
              </span>
              {!isAllHistory && activeSession && (
                <button
                  type="button"
                  onClick={() => {
                    deleteSession(activeSession.id);
                    showToast(`已删除当前对话「${activeSession.title || '未命名对话'}」`);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  title="删除当前对话"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 搜索框 */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={isAllHistory ? "在全部生成历史中搜索..." : "在当前对话中搜索..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 sm:w-60 pl-8 pr-3 py-1.5 rounded-full bg-slate-100/90 border border-transparent focus:border-slate-300 focus:bg-white text-xs outline-none transition-all placeholder:text-slate-400 text-slate-700"
              />
            </div>
          </div>

          {/* 右侧筛选下拉与资产库按钮 */}
          <div ref={headerFilterRef} className="flex items-center gap-2 text-xs">
            {/* 时间筛选 */}
            <div className="relative">
              <button 
                type="button"
                onClick={() => {
                  setShowTimeMenu(!showTimeMenu);
                  setShowModeMenu(false);
                  setShowStatusMenu(false);
                }}
                className={`px-3 py-1.5 rounded-full font-medium flex items-center gap-1 transition-all cursor-pointer border ${
                  timeFilter !== 'all'
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                    : 'bg-slate-100/90 hover:bg-slate-200/80 border-transparent text-slate-600'
                }`}
              >
                <span>{timeFilter === 'today' ? '今天' : timeFilter === '7days' ? '最近7天' : timeFilter === '30days' ? '最近30天' : '时间'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showTimeMenu ? 'rotate-180 opacity-100' : 'opacity-60'}`} />
              </button>

              {showTimeMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-32 rounded-2xl bg-white border border-slate-200/90 shadow-xl p-1.5 z-30 animate-fade-in space-y-0.5">
                  {[
                    { id: 'all', label: '全部时间' },
                    { id: 'today', label: '今天' },
                    { id: '7days', label: '最近 7 天' },
                    { id: '30days', label: '最近 30 天' }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTimeFilter(item.id as any);
                        setShowTimeMenu(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        timeFilter === item.id 
                          ? 'bg-indigo-50 text-indigo-700 font-bold' 
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{item.label}</span>
                      {timeFilter === item.id && <Check className="w-3 h-3 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 生成模式 */}
            <div className="relative">
              <button 
                type="button"
                onClick={() => {
                  setShowModeMenu(!showModeMenu);
                  setShowTimeMenu(false);
                  setShowStatusMenu(false);
                }}
                className={`px-3 py-1.5 rounded-full font-medium flex items-center gap-1 transition-all cursor-pointer border ${
                  modeFilter !== 'all'
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                    : 'bg-slate-100/90 hover:bg-slate-200/80 border-transparent text-slate-600'
                }`}
              >
                <span>{modeFilter === 'image' ? '图片生成' : modeFilter === 'video' ? '视频生成' : '生成模式'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showModeMenu ? 'rotate-180 opacity-100' : 'opacity-60'}`} />
              </button>

              {showModeMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-36 rounded-2xl bg-white border border-slate-200/90 shadow-xl p-1.5 z-30 animate-fade-in space-y-0.5">
                  {[
                    { id: 'all', label: '全部模式' },
                    { id: 'image', label: '🖼️ 图片生成' },
                    { id: 'video', label: '🎬 视频生成' }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setModeFilter(item.id as any);
                        setShowModeMenu(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        modeFilter === item.id 
                          ? 'bg-indigo-50 text-indigo-700 font-bold' 
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{item.label}</span>
                      {modeFilter === item.id && <Check className="w-3 h-3 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 操作类型 / 状态 */}
            <div className="relative">
              <button 
                type="button"
                onClick={() => {
                  setShowStatusMenu(!showStatusMenu);
                  setShowTimeMenu(false);
                  setShowModeMenu(false);
                }}
                className={`px-3 py-1.5 rounded-full font-medium flex items-center gap-1 transition-all cursor-pointer border ${
                  statusFilter !== 'all'
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                    : 'bg-slate-100/90 hover:bg-slate-200/80 border-transparent text-slate-600'
                }`}
              >
                <span>{statusFilter === 'success' ? '已完成' : statusFilter === 'progress' ? '生成中' : statusFilter === 'failure' ? '失败' : '操作类型'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showStatusMenu ? 'rotate-180 opacity-100' : 'opacity-60'}`} />
              </button>

              {showStatusMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-36 rounded-2xl bg-white border border-slate-200/90 shadow-xl p-1.5 z-30 animate-fade-in space-y-0.5">
                  {[
                    { id: 'all', label: '全部状态' },
                    { id: 'success', label: '✅ 成功出图/片' },
                    { id: 'progress', label: '⏳ 正在生成中' },
                    { id: 'failure', label: '❌ 生成失败' }
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setStatusFilter(item.id as any);
                        setShowStatusMenu(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        statusFilter === item.id 
                          ? 'bg-indigo-50 text-indigo-700 font-bold' 
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{item.label}</span>
                      {statusFilter === item.id && <Check className="w-3 h-3 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 资产库按钮 */}
            <button 
              type="button"
              onClick={onOpenProductVault}
              className="px-3 py-1.5 rounded-full bg-slate-100/90 hover:bg-slate-200/80 text-slate-700 font-bold flex items-center gap-1.5 transition-all cursor-pointer ml-1 active:scale-95"
              title="打开商品资产库"
            >
              <FolderArchive className="w-3.5 h-3.5 text-slate-500" />
              <span>资产库</span>
            </button>
          </div>
        </header>

        {/* 中间：可滚动的会话对话流 (对话形式，纯净聚焦，支持自动引用当前对话内容修改) */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 pb-64 space-y-8">
          {taskBatches.length === 0 ? (
            /* 新对话/空状态 */
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4 max-w-lg mx-auto animate-fade-in">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-50 to-purple-50 border border-indigo-100 flex items-center justify-center text-indigo-500 shadow-sm">
                <Sparkles className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-800">
                  {isAllHistory 
                    ? '暂无生成历史记录' 
                    : (activeSession?.title && activeSession.title !== '未命名对话' ? activeSession.title : '开启全新对话创作')}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                  {isAllHistory
                    ? '您生成的所有图片与视频作品都将统一汇总并永久保存在此处与资产中心。'
                    : '在下方输入框输入提示词或上传参考图开始创作。在当前对话中，后续提示词将自动引用本轮生成的成果进行迭代修改。'}
                </p>
              </div>
              
              {/* 快捷创意灵感气泡 */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {[
                  '🐱 一只软萌可爱的英短金渐层小猫咪',
                  '📱 极简未来风哑光钛金属智能手机特写',
                  '🌸 东方美学高定汉服少女自然光摄影',
                  '☕ 温暖午后咖啡厅拉花与书籍静物'
                ].map((hint, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setQuickPrompt(hint.replace(/^[^\w\u4e00-\u9fa5]+/, ''))}
                    className="px-3 py-1.5 rounded-full bg-slate-100/80 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200/60 hover:border-indigo-200 text-slate-600 text-xs transition-all cursor-pointer shadow-2xs"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 🌟 会话历史生成流 (严格对照用户参考图1: 无外层大白框，靠左布局，日期大标题，紧凑成片卡片 + 居中胶囊操作按钮) */
            <div className="w-full pl-2 sm:pl-6 lg:pl-10 pr-4 space-y-10 animate-fade-in">
              {dateGroupedBatches.map((group) => (
                <div key={group.dateLabel} className="space-y-6">
                  {/* 🌟 日期大标题 (严格对照图1: "昨天" / "今天") */}
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {group.dateLabel}
                  </h2>

                  <div className="space-y-10">
                    {group.batches.map((batch, bIdx) => {
                      const isAllDone = batch.tasks.every(t => t.status === 'SUCCESS');
                      const hasFail = batch.tasks.some(t => t.status === 'FAILURE');
                      const isGenerating = batch.tasks.some(t => (t.status === 'IN_PROGRESS' || t.status === 'IDLE' || !t.status) && !t.resultUrl);
                      const isBatchVideo = batch.tasks.some(t => t.mediaType === 'video' || t.resultUrl?.includes('.mp4') || (t.model && (t.model.toLowerCase().includes('seedance') || t.model.toLowerCase().includes('veo') || t.model.toLowerCase().includes('kling') || t.model.toLowerCase().includes('minimax') || t.model.toLowerCase().includes('h3') || t.model.toLowerCase().includes('hailuo') || t.model.toLowerCase().includes('wan') || t.model.toLowerCase().includes('vidu') || t.model.toLowerCase().includes('luma') || t.model.toLowerCase().includes('hunyuan'))));
                      
                      const displayModel = formatDisplayModel(batch.model, isBatchVideo);
                      const displayRatio = getAspectRatioFromSize(batch.size);
                      const displayQuality = isBatchVideo
                        ? (batch.quality || batch.tasks[0]?.videoResolution || '720P')
                        : (batch.quality === 'high' ? '2K' : (batch.quality || '2K'));

                      const primaryTask = batch.tasks[0];
                      const isSingle = batch.tasks.length === 1;
                      const isUnfolded = unfoldedBatchIds.has(batch.batchId);

                      // 清理标题前缀（例如去掉“第X张：”），提供更加规整优雅的展示
                      const rawTitle = batch.title || batch.prompt?.slice(0, 20) || 'AI 创作';
                      const cleanBatchTitle = rawTitle.replace(/^第\s*\d+\s*张\s*[:：]\s*/, '');
                      const displayBatchTitle = isSingle 
                        ? cleanBatchTitle 
                        : `${cleanBatchTitle} · 套图 (${batch.tasks.length} 张)`;

                      return (
                        <div 
                          key={`${batch.batchId || 'batch'}-${bIdx}`}
                          className={`space-y-3 w-full transition-all duration-300 ${
                            isSingle ? 'max-w-xs sm:max-w-sm' : !isUnfolded ? 'max-w-fit' : 'max-w-4xl xl:max-w-5xl'
                          }`}
                        >
                          {/* 🌟 1. 对话轮次元信息标头 */}
                          <div className="flex items-center justify-between w-full px-1 text-xs text-slate-500 font-medium">
                            <div className="flex items-center gap-2 truncate pr-2">
                              <span className="font-bold text-slate-800 truncate" title={batch.prompt}>
                                {displayBatchTitle}
                              </span>
                              <span className="text-slate-400 font-normal shrink-0">
                                {isBatchVideo ? '视频' : '图片'} {displayModel}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono shrink-0">
                              <span>{displayRatio}</span>
                              <span>|</span>
                              <span>{displayQuality}</span>
                              
                              {!isSingle && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUnfoldedBatchIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(batch.batchId)) next.delete(batch.batchId);
                                      else next.add(batch.batchId);
                                      return next;
                                    });
                                  }}
                                  className="ml-1 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-sans font-bold"
                                  title={isUnfolded ? '收起为折叠画册' : '展开多图分镜'}
                                >
                                  {isUnfolded ? (
                                    <>
                                      <span>收起</span>
                                      <ChevronUp className="w-3 h-3" />
                                    </>
                                  ) : (
                                    <>
                                      <span>展开 ({batch.tasks.length})</span>
                                      <ChevronDown className="w-3 h-3" />
                                    </>
                                  )}
                                </button>
                              )}

                              <button 
                                type="button"
                                onClick={() => setPreviewTask(primaryTask)}
                                className="text-slate-400 hover:text-slate-700 ml-1 transition-colors cursor-pointer flex items-center gap-0.5 text-xs font-sans"
                                title="查看详细生成参数"
                              >
                                <span>详细信息</span>
                                <Info className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* 🌟 2. 媒体内容展示区域 */}
                          {isSingle ? (
                            /* 🌟 2.1 单张大图/视频卡片 */
                            <div className="w-full space-y-3">
                              <div className={`relative w-full rounded-2xl overflow-hidden shadow-xs hover:shadow-lg border border-slate-200/90 bg-white transition-all duration-300 ${getAspectRatioClass(primaryTask.size)}`}>
                                {/* 生成中状态 */}
                                {isGenerating && (
                                  <div className="absolute inset-0 z-10">
                                    <AIGeneratingCard 
                                      task={primaryTask} 
                                      progressNumber={primaryTask.progress && primaryTask.progress.includes('%') ? parseInt(primaryTask.progress, 10) : 35} 
                                      isVideo={Boolean(isBatchVideo)} 
                                    />
                                  </div>
                                )}

                                {/* 生成成功状态 */}
                                {primaryTask.status === 'SUCCESS' && primaryTask.resultUrl && (
                                  <div className="relative w-full h-full group/media">
                                    {isBatchVideo ? (
                                      <video
                                        src={primaryTask.resultUrl}
                                        autoPlay
                                        loop
                                        muted
                                        playsInline
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover/media:scale-102 cursor-pointer bg-black"
                                        onClick={() => setPreviewTask(primaryTask)}
                                        title="点击全屏播放视频"
                                      />
                                    ) : (
                                      <img 
                                        src={primaryTask.resultUrl} 
                                        alt={primaryTask.title || '生成结果'}
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover/media:scale-102 cursor-pointer"
                                        onClick={() => setPreviewTask(primaryTask)}
                                        title="点击全屏放大查看"
                                      />
                                    )}

                                    <div className="absolute inset-0 bg-slate-950/25 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                      <div className="px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-white text-xs font-medium flex items-center gap-1.5 shadow-lg">
                                        {isBatchVideo ? <Film className="w-3.5 h-3.5 text-cyan-300" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                        <span>{isBatchVideo ? '播放视频' : '点击放大'}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* 失败状态 */}
                                {primaryTask.status === 'FAILURE' && (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-red-50/90 space-y-2.5">
                                    <AlertCircle className="w-8 h-8 text-red-500" />
                                    <div className="space-y-1">
                                      <p className="text-xs font-bold text-red-700">生成失败</p>
                                      <p className="text-[11px] text-red-500 max-w-xs">{primaryTask.failReason || '接口响应异常'}</p>
                                    </div>
                                    <button
                                      onClick={() => handleRetryTask(primaryTask)}
                                      className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs text-white font-bold transition-colors cursor-pointer shadow-xs"
                                    >
                                      立即重试
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* 卡片下方胶囊按钮操作栏 */}
                              <div className="flex items-center justify-center gap-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleReuseTask(primaryTask)}
                                  className="py-1.5 px-4 rounded-xl bg-slate-100/90 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                                  title="自动引用本轮提示词与成果进行修改"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                                  <span>重新编辑</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleRegenerateTask(primaryTask)}
                                  className="py-1.5 px-4 rounded-xl bg-slate-100/90 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                                  title="在当前对话中再次生成"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                                  <span>再次生成</span>
                                </button>

                                {/* 更多菜单 */}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuTaskId(openMenuTaskId === primaryTask.id ? null : primaryTask.id);
                                    }}
                                    className="w-8 h-8 rounded-xl bg-slate-100/90 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                                    title="更多选项"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>

                                  {openMenuTaskId === primaryTask.id && (
                                    <div 
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-0 bottom-full mb-2 w-40 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-1.5 z-40 space-y-0.5 text-xs text-slate-700 animate-fade-in"
                                    >
                                      {primaryTask.resultUrl && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            useAppStore.getState().setQuickRefImage(primaryTask.resultUrl!);
                                            setOpenMenuTaskId(null);
                                          }}
                                          className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 flex items-center gap-2 text-left cursor-pointer font-medium"
                                        >
                                          <ImagePlus className="w-3.5 h-3.5 text-indigo-600" />
                                          <span>设为参考图</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleCopyPrompt(primaryTask);
                                          setOpenMenuTaskId(null);
                                        }}
                                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 flex items-center gap-2 text-left cursor-pointer"
                                      >
                                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                                        <span>复制提示词</span>
                                      </button>
                                      {primaryTask.resultUrl && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleDownloadImage(primaryTask.resultUrl!, primaryTask.title);
                                            setOpenMenuTaskId(null);
                                          }}
                                          className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 flex items-center gap-2 text-left cursor-pointer"
                                        >
                                          <Download className="w-3.5 h-3.5 text-slate-500" />
                                          <span>{isBatchVideo ? '下载视频' : '下载原图'}</span>
                                        </button>
                                      )}
                                      <div className="h-px bg-slate-100 my-1" />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          deleteHubGeneration(primaryTask.id);
                                          if (primaryTask.taskId && primaryTask.taskId !== primaryTask.id) {
                                            deleteHubGeneration(primaryTask.taskId);
                                          }
                                          setOpenMenuTaskId(null);
                                          showToast('已从对话记录中移除此卡片');
                                        }}
                                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-red-50 text-red-600 flex items-center gap-2 text-left cursor-pointer font-bold"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                        <span>从对话中移除</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : !isUnfolded ? (
                            /* 🌟 2.2 多图折叠堆叠相册风格 (Stacked Album Deck - 精准对应用户参考图3) */
                            <div className="w-full space-y-2.5">
                              <div 
                                onClick={() => {
                                  setUnfoldedBatchIds(prev => {
                                    const next = new Set(prev);
                                    next.add(batch.batchId);
                                    return next;
                                  });
                                }}
                                className="relative group/stack inline-block cursor-pointer"
                                title="点击展开查看全部多图分镜"
                               >
                                {/* 拟物底层卡片 2 (最底层微旋转与阴影) */}
                                <div className="absolute inset-0 bg-white rounded-2xl -z-20 border border-slate-200/90 shadow-md transform rotate-6 translate-x-3 -translate-y-1.5 pointer-events-none group-hover/stack:rotate-8 group-hover/stack:translate-x-4 transition-all duration-300" />
                                
                                {/* 拟物底层卡片 1 (中间层微旋转与阴影) */}
                                <div className="absolute inset-0 bg-white rounded-2xl -z-10 border border-slate-200/90 shadow-sm transform rotate-3 translate-x-1.5 -translate-y-0.5 pointer-events-none group-hover/stack:rotate-4 group-hover/stack:translate-x-2 transition-all duration-300" />

                                {/* 顶层主封面卡片 (紧凑精致) */}
                                <div className={`relative w-48 sm:w-56 md:w-60 rounded-2xl overflow-hidden shadow-xs hover:shadow-xl border border-slate-200/90 bg-white transition-all duration-300 ${getAspectRatioClass(primaryTask.size)}`}>
                                  {/* 封面内容 */}
                                  {isGenerating ? (
                                    <AIGeneratingCard task={primaryTask} isVideo={isBatchVideo} />
                                  ) : primaryTask.resultUrl ? (
                                    <div className="relative w-full h-full">
                                      {isBatchVideo ? (
                                        <video
                                          src={primaryTask.resultUrl}
                                          autoPlay
                                          loop
                                          muted
                                          playsInline
                                          className="w-full h-full object-cover group-hover/stack:scale-102 transition-transform duration-300 bg-black"
                                        />
                                      ) : (
                                        <img 
                                          src={primaryTask.resultUrl} 
                                          alt={primaryTask.title || '生成结果'}
                                          className="w-full h-full object-cover group-hover/stack:scale-102 transition-transform duration-300"
                                        />
                                      )}

                                      {/* 🌟 仿即梦/微信相册叠层角标 (右下角 +N 徽标，严格对照用户参考图3) */}
                                      <div className="absolute bottom-2.5 right-2.5 z-20 px-2 py-1 rounded-full bg-black/75 backdrop-blur-md text-white text-[11px] font-bold font-mono flex items-center gap-1 shadow-lg border border-white/20 pointer-events-none">
                                        <Layers className="w-3 h-3 text-indigo-300" />
                                        <span>+{batch.tasks.length - 1}</span>
                                      </div>

                                      {/* 悬停展开浮层指示器 */}
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover/stack:opacity-100 transition-opacity flex flex-col justify-end p-3 z-10">
                                        <div className="py-1.5 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-lg transition-colors">
                                          <Layers className="w-3 h-3" />
                                          <span>展开全部 {batch.tasks.length} 张</span>
                                          <ChevronDown className="w-3 h-3" />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                                      <span>暂无预览</span>
                                    </div>
                                  )}
                                </div>

                                {/* 🌟 悬浮微缩相册弹窗 (Hover Preview Strip) */}
                                <div className="absolute left-full top-0 ml-3.5 hidden group-hover/stack:flex flex-col gap-1.5 p-2 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-2xl z-40 animate-fade-in pointer-events-auto">
                                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 px-1 pb-1 border-b border-slate-100">
                                    <span>套图全览 ({batch.tasks.length})</span>
                                    <span className="text-[10px] text-indigo-600">点击单张可放大</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 max-w-xs overflow-x-auto p-0.5">
                                    {batch.tasks.map((task, tIdx) => (
                                      <div
                                        key={task.id || tIdx}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewTask(task);
                                        }}
                                        className="w-14 h-18 rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-500 hover:scale-105 transition-all flex-shrink-0 cursor-pointer relative group/thumb shadow-xs"
                                        title={`第 ${tIdx + 1} 张 · 点击放大`}
                                      >
                                        {task.resultUrl ? (
                                          isBatchVideo ? (
                                            <video src={task.resultUrl} className="w-full h-full object-cover bg-black" />
                                          ) : (
                                            <img src={task.resultUrl} alt={`分镜${tIdx + 1}`} className="w-full h-full object-cover" />
                                          )
                                        ) : (
                                          <div className="w-full h-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                                            {tIdx + 1}
                                          </div>
                                        )}
                                        <span className="absolute bottom-0.5 right-0.5 text-[9px] px-1 py-0.2 rounded bg-black/60 text-white font-mono">
                                          {tIdx + 1}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* 🌟 折叠卡片下方胶囊按钮操作栏 */}
                              <div className="flex items-center gap-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUnfoldedBatchIds(prev => {
                                      const next = new Set(prev);
                                      next.add(batch.batchId);
                                      return next;
                                    });
                                  }}
                                  className="py-1.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 border border-indigo-200/60"
                                  title="展开全部多图分镜"
                                >
                                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>展开分镜 ({batch.tasks.length})</span>
                                  <ChevronDown className="w-3.5 h-3.5 text-indigo-500" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleReuseTask(primaryTask)}
                                  className="py-1.5 px-3 rounded-xl bg-slate-100/90 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                                  title="重新编辑本轮提示词"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                                  <span>编辑</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleRegenerateTask(primaryTask)}
                                  className="py-1.5 px-3 rounded-xl bg-slate-100/90 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                                  title="在当前对话中再次生成整套"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                                  <span>再次生成</span>
                                </button>

                                {/* 更多菜单 */}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuTaskId(openMenuTaskId === primaryTask.id ? null : primaryTask.id);
                                    }}
                                    className="w-8 h-8 rounded-xl bg-slate-100/90 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                                    title="更多选项"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>

                                  {openMenuTaskId === primaryTask.id && (
                                    <div 
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-0 bottom-full mb-2 w-40 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-1.5 z-40 space-y-0.5 text-xs text-slate-700 animate-fade-in"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleCopyPrompt(primaryTask);
                                          setOpenMenuTaskId(null);
                                        }}
                                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 flex items-center gap-2 text-left cursor-pointer"
                                      >
                                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                                        <span>复制提示词</span>
                                      </button>
                                      {primaryTask.resultUrl && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleDownloadImage(primaryTask.resultUrl!, primaryTask.title);
                                            setOpenMenuTaskId(null);
                                          }}
                                          className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 flex items-center gap-2 text-left cursor-pointer"
                                        >
                                          <Download className="w-3.5 h-3.5 text-slate-500" />
                                          <span>下载封面</span>
                                        </button>
                                      )}
                                      <div className="h-px bg-slate-100 my-1" />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          batch.tasks.forEach(t => {
                                            deleteHubGeneration(t.id);
                                            if (t.taskId && t.taskId !== t.id) deleteHubGeneration(t.taskId);
                                          });
                                          setOpenMenuTaskId(null);
                                          showToast('已从对话记录中移除此套图');
                                        }}
                                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-red-50 text-red-600 flex items-center gap-2 text-left cursor-pointer font-bold"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                        <span>从对话中移除</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* 🌟 2.3 多图已展开网格展示 (Expanded Grid View) */
                            <div className="w-full space-y-3">
                              {/* 顶部一键收起栏 */}
                              <div className="flex items-center justify-between pb-1 px-1">
                                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>套图画廊 ({batch.tasks.length} 张)</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUnfoldedBatchIds(prev => {
                                      const next = new Set(prev);
                                      next.delete(batch.batchId);
                                      return next;
                                    });
                                  }}
                                  className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <span>收起为相册</span>
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className={`grid gap-3.5 w-full ${
                                batch.tasks.length === 2 ? 'grid-cols-2 max-w-md' :
                                batch.tasks.length === 3 ? 'grid-cols-2 sm:grid-cols-3 max-w-2xl' :
                                batch.tasks.length === 4 ? 'grid-cols-2 sm:grid-cols-4 max-w-3xl' :
                                'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 max-w-4xl'
                              }`}>
                                {batch.tasks.map((task, idx) => (
                                  <div key={`${task.id || 't'}-${idx}`} className="space-y-2 group/card">
                                    <div className={`relative w-full rounded-2xl overflow-hidden shadow-xs hover:shadow-lg border border-slate-200/90 bg-white transition-all duration-300 ${getAspectRatioClass(task.size)}`}>
                                      {task.status === 'IN_PROGRESS' || !task.resultUrl ? (
                                        <AIGeneratingCard task={task} isVideo={isBatchVideo} />
                                      ) : (
                                        <div className="relative w-full h-full">
                                          <img 
                                            src={task.resultUrl} 
                                            alt="" 
                                            className="w-full h-full object-cover cursor-pointer hover:scale-102 transition-transform duration-300"
                                            onClick={() => setPreviewTask(task)}
                                            title="点击全屏放大查看"
                                          />
                                          <div 
                                            onClick={() => setPreviewTask(task)}
                                            className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center cursor-pointer pointer-events-none"
                                          >
                                            <div className="px-2.5 py-1 rounded-xl bg-black/75 backdrop-blur-md text-white text-[11px] font-medium flex items-center gap-1 shadow-md">
                                              <Maximize2 className="w-3 h-3" />
                                              <span>放大</span>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* 分镜卡片下方精致操作栏 */}
                                    <div className="flex items-center justify-between px-1">
                                      <span className="text-xs font-bold text-slate-800">
                                        分镜 {idx + 1}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleReuseTask(task)}
                                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer shadow-2xs active:scale-95"
                                          title="重新编辑本分镜"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRegenerateTask(task)}
                                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer shadow-2xs active:scale-95"
                                          title="再次生成本分镜"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* 展开态底部收起按钮 */}
                              <div className="flex justify-center pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUnfoldedBatchIds(prev => {
                                      const next = new Set(prev);
                                      next.delete(batch.batchId);
                                      return next;
                                    });
                                  }}
                                  className="py-1.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                  <span>收起分镜套图</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 🌟 3. 底部吸底提示词控制栏 (去除两侧多余毛玻璃翅膀，仅保留核心控制栏本身) */}
        <div className="absolute bottom-4 inset-x-6 z-30 pointer-events-none">
          <div className="w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1400px] mx-auto pointer-events-auto">
            <PromptActionBar 
              onOpenProductVault={onOpenProductVault}
              dropdownPlacement="up"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
