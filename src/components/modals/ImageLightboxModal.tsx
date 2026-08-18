'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { 
  X, 
  Sparkles, 
  Image as ImageIcon, 
  Heart, 
  ChevronUp, 
  ChevronDown, 
  MoreHorizontal, 
  Info,
  Download,
  Trash2,
  Copy,
  Check,
  ExternalLink
} from 'lucide-react';
import { formatDisplayModel, formatPromptParagraphs, getAspectRatioFromSize } from '@/lib/drawing';

export default function ImageLightboxModal() {
  const { 
    previewTask, 
    setPreviewTask, 
    hubGenerations, 
    deleteHubGeneration,
    deleteGenerationPermanently,
    setQuickPrompt,
    setQuickRefImage,
    setHubGenMode
  } = useAppStore();

  const [likes, setLikes] = useState(69);
  const [isLiked, setIsLiked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dbTasks, setDbTasks] = useState<any[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isVideo = Boolean(
    previewTask?.mediaType === 'video' || 
    (previewTask?.resultUrl && (previewTask.resultUrl.includes('.mp4') || previewTask.resultUrl.includes('video')))
  );

  // 物理删除记录
  const handleDelete = async () => {
    if (!previewTask) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3500);
      return;
    }
    const id = previewTask.id;
    const taskId = (previewTask as any).taskId;
    const dbId = (previewTask as any).dbId;
    const resultUrl = previewTask.resultUrl;

    const idsToDelete = [id, taskId, dbId].filter(Boolean) as string[];
    const urlsToDelete = [resultUrl].filter(Boolean) as string[];

    try {
      await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: idsToDelete,
          urls: urlsToDelete
        })
      });
    } catch (e) {}

    deleteGenerationPermanently(idsToDelete, urlsToDelete);
    setPreviewTask(null);
  };

  // 异步获取数据库历史任务，确保前后翻页能覆盖全量历史资产
  useEffect(() => {
    fetch('/api/tasks')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.tasks)) {
          setDbTasks(data.tasks.filter((t: any) => t.status === 'SUCCESS' && t.resultUrl));
        }
      })
      .catch(() => {});
  }, [previewTask?.id]);

  // 合并前端与数据库中的全部成功任务以供完整流畅翻页
  const successTasks = useMemo(() => {
    const map = new Map<string, any>();
    hubGenerations.filter(t => t.status === 'SUCCESS' && t.resultUrl).forEach(t => map.set(t.id, t));
    dbTasks.forEach(t => {
      const key = t.taskId || t.id;
      if (!map.has(t.id) && (!t.taskId || !map.has(t.taskId))) {
        map.set(key, t);
      }
    });
    return Array.from(map.values());
  }, [hubGenerations, dbTasks]);

  const currentIndex = previewTask ? successTasks.findIndex(t => t.id === previewTask.id || (previewTask.taskId && t.taskId === previewTask.taskId)) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < successTasks.length - 1;

  useEffect(() => {
    if (previewTask) {
      const baseLikes = typeof previewTask.createdAt === 'number' 
        ? Math.floor((previewTask.createdAt % 100) + 38) 
        : 69;
      setLikes(baseLikes);
      setIsLiked(false);
      setIsFollowing(false);
      setShowMoreMenu(false);
      setCopied(false);
    }
  }, [previewTask?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!previewTask) return;
      if (e.key === 'Escape') {
        setPreviewTask(null);
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && hasPrev) {
        setPreviewTask(successTasks[currentIndex - 1]);
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && hasNext) {
        setPreviewTask(successTasks[currentIndex + 1]);
      } else if (e.key === ' ' && isVideo && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) {
          videoRef.current.play();
        } else {
          videoRef.current.pause();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewTask, currentIndex, successTasks, hasPrev, hasNext, setPreviewTask, isVideo]);

  if (!previewTask || !previewTask.resultUrl) return null;

  // 日期格式化
  const dateStr = previewTask.createdAt 
    ? new Date(previewTask.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
    : new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');

  const handlePrev = () => {
    if (hasPrev) {
      setPreviewTask(successTasks[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      setPreviewTask(successTasks[currentIndex + 1]);
    }
  };

  const handleToggleLike = () => {
    if (isLiked) {
      setLikes(prev => Math.max(0, prev - 1));
      setIsLiked(false);
    } else {
      setLikes(prev => prev + 1);
      setIsLiked(true);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(previewTask.resultUrl!);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const ext = isVideo ? 'mp4' : 'png';
      link.download = `beikeyuntu_${isVideo ? 'video' : 'image'}_${Date.now()}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(previewTask.resultUrl, '_blank');
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(previewTask.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteCurrent = handleDelete;

  // 做同款：填入提示词并切换模式
  const handleUsePromptOnly = () => {
    setQuickPrompt(previewTask.prompt);
    if (isVideo) {
      setHubGenMode('video');
    } else {
      setHubGenMode('image');
    }
    setPreviewTask(null);
  };

  // 用作参考图：填入提示词与参考图
  const handleUseAsReference = () => {
    setQuickPrompt(previewTask.prompt);
    if (previewTask.resultUrl) {
      setQuickRefImage(previewTask.resultUrl);
    }
    if (isVideo) {
      setHubGenMode('video');
    } else {
      setHubGenMode('image');
    }
    setPreviewTask(null);
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 lg:p-10 select-none font-sans animate-fade-in"
      onClick={() => setPreviewTask(null)}
    >
      {/* 🌟 居中对齐的主画框容器 (严格对标主页灵感详情：左侧媒体展示 + 中间控制钮 + 右侧浮动信息卡) */}
      <div 
        className="w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl max-h-[92vh] flex flex-col md:flex-row items-center justify-center gap-4 lg:gap-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🌟 1. 左侧：全尺寸高清大图/大视频呈现 */}
        <div className="flex-1 h-full max-h-[88vh] flex items-center justify-center relative min-w-0">
          {isVideo ? (
            <video
              ref={videoRef}
              src={previewTask.resultUrl}
              controls
              autoPlay
              loop
              playsInline
              className="max-h-[86vh] w-auto max-w-full object-contain rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.22)] border border-white/60 select-none transition-all duration-300 bg-black"
            />
          ) : (
            <img 
              src={previewTask.resultUrl} 
              alt={previewTask.title || '生成成果'}
              className="max-h-[86vh] w-auto max-w-full object-contain rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-white/60 select-none transition-all duration-300"
            />
          )}
        </div>

        {/* 🌟 2. 中间/右侧翻页与关闭浮动按钮组 (严格对标主页灵感详情) */}
        <div className="flex md:flex-col items-center justify-center gap-3 z-30 flex-shrink-0">
          {/* 关闭按钮 (✕) */}
          <button
            onClick={() => setPreviewTask(null)}
            className="w-9 h-9 rounded-xl bg-white/90 hover:bg-white text-slate-700 shadow-md border border-slate-200/80 flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="关闭 (Esc)"
          >
            <X className="w-4.5 h-4.5 stroke-[2.2]" />
          </button>

          {/* 向上/上一个 */}
          <button
            onClick={handlePrev}
            disabled={!hasPrev}
            className={`w-8 h-8 rounded-full bg-white/80 hover:bg-white shadow-sm border border-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer ${
              !hasPrev ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105 active:scale-95'
            }`}
            title="查看上一个 (↑ / ←)"
          >
            <ChevronUp className="w-4.5 h-4.5 stroke-[2]" />
          </button>

          {/* 向下/下一个 */}
          <button
            onClick={handleNext}
            disabled={!hasNext}
            className={`w-8 h-8 rounded-full bg-white/80 hover:bg-white shadow-sm border border-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer ${
              !hasNext ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105 active:scale-95'
            }`}
            title="查看下一个 (↓ / →)"
          >
            <ChevronDown className="w-4.5 h-4.5 stroke-[2]" />
          </button>
        </div>

        {/* 🌟 3. 右侧：精致大方的信息与操作面板 (严格对标主页灵感详情) */}
        <div className="w-full md:w-[350px] lg:w-[380px] xl:w-[400px] max-h-[86vh] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200/90 flex flex-col justify-between flex-shrink-0 overflow-y-auto relative">
          <div className="space-y-5">
            {/* 作者信息与右侧互动 (严格对标主页设计) */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-red-500 to-orange-500 text-white flex items-center justify-center font-bold text-[11px] shadow-xs">
                  贝
                </div>
                <span className="text-xs font-bold text-slate-900">
                  贝壳云图
                </span>
                <button
                  onClick={() => setIsFollowing(!isFollowing)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                    isFollowing 
                      ? 'bg-slate-100 text-slate-500' 
                      : 'bg-[#F2F4F7] hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  {isFollowing ? '已关注' : '+ 关注'}
                </button>
              </div>

              {/* 点赞与更多操作菜单 */}
              <div className="flex items-center gap-2.5 relative">
                <button
                  onClick={handleToggleLike}
                  className="flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
                  title="点赞"
                >
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500 stroke-rose-500' : 'text-slate-600 stroke-[1.8]'}`} />
                  <span>{likes}</span>
                </button>

                <div className="relative">
                  <button 
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    className="text-slate-400 hover:text-slate-800 transition-colors cursor-pointer p-0.5 rounded-lg hover:bg-slate-100"
                    title="更多操作"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {/* 弹出更多下拉菜单 */}
                  {showMoreMenu && (
                    <div className="absolute right-0 top-full mt-1.5 w-36 bg-white rounded-2xl shadow-xl border border-slate-200/90 p-1.5 z-40 space-y-0.5 text-xs text-slate-700 animate-fade-in">
                      <button
                        onClick={() => {
                          handleDownload();
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 flex items-center gap-2 text-left cursor-pointer font-medium"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>{isVideo ? '下载视频' : '下载原图'}</span>
                      </button>

                      <button
                        onClick={() => {
                          handleCopyPrompt();
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 flex items-center gap-2 text-left cursor-pointer font-medium"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>复制提示词</span>
                      </button>

                      <button
                        onClick={() => {
                          window.open(previewTask.resultUrl, '_blank');
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 flex items-center gap-2 text-left cursor-pointer font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        <span>新标签打开</span>
                      </button>

                      <div className="h-px bg-slate-100 my-1" />

                      <button
                        onClick={() => {
                          handleDeleteCurrent();
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-xl hover:bg-red-50 text-red-600 flex items-center gap-2 text-left cursor-pointer font-bold"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        <span>删除记录</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 日期与生成标记 */}
            <div className="text-[11px] text-slate-400 font-sans">
              {dateStr} | 内容由 AI 生成
            </div>

            {/* 提示词正文 (分段排版，自然呼吸感，优雅易读) */}
            <div className="space-y-2 pt-1">
              <div className="text-xs font-medium text-slate-400">
                {isVideo ? '视频提示词' : '图片提示词'}
              </div>
              <div className="text-[13px] sm:text-[13.5px] text-slate-800 leading-relaxed font-normal select-text max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 pr-1 space-y-2.5">
                {formatPromptParagraphs(previewTask.prompt).map((para, pIdx) => (
                  <p key={pIdx} className="break-words leading-relaxed">
                    {para}
                  </p>
                ))}
              </div>
            </div>

            {/* 参数规格标签条 (严格对标展示：友好模型名称 ｜ 比例 ｜ 画质 ｜ 更多 ⓘ) */}
            <div className="pt-2.5 flex items-center gap-2.5 text-xs text-slate-400 font-sans border-t border-slate-100">
              <span className="font-medium text-slate-700">{formatDisplayModel(previewTask.model, isVideo)}</span>
              <span className="text-slate-300">|</span>
              <span className="font-mono text-slate-600">{getAspectRatioFromSize(previewTask.size) || '3:4'}</span>
              <span className="text-slate-300">|</span>
              <span className="font-mono text-slate-600">
                {isVideo 
                  ? (previewTask.quality === 'high' || !previewTask.quality ? '720P' : previewTask.quality) 
                  : (previewTask.quality === 'high' ? '2K' : (previewTask.quality || '2K'))}
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-0.5 text-slate-500">
                <span>更多</span>
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* 🌟 底部双按钮 (做同款 / 用作参考图，严格对标主页设计) */}
          <div className="pt-6 mt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
            {/* 做同款 */}
            <button
              onClick={handleUsePromptOnly}
              className="py-2.5 px-3 rounded-xl bg-[#F0F2F5] hover:bg-[#E4E7EB] text-slate-900 font-bold text-xs sm:text-[13px] flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-slate-700" />
              <span>做同款</span>
            </button>

            {/* 用作参考图 */}
            <button
              onClick={handleUseAsReference}
              className="py-2.5 px-3 rounded-xl bg-[#F0F2F5] hover:bg-[#E4E7EB] text-slate-900 font-bold text-xs sm:text-[13px] flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <ImageIcon className="w-3.5 h-3.5 text-slate-700" />
              <span>用作参考图</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
