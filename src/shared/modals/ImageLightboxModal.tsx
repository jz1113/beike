'use client';
import { proxyMediaUrl } from '@/lib/apiClient';
import { permanentDeleteGeneration } from '@/lib/permanentDeleteGeneration';
import { downloadMediaOrOpen, openExternalUrl } from '@/lib/downloadMedia';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { 
  X, 
  Sparkles, 
  Image as ImageIcon, 
  ChevronLeft, 
  ChevronRight, 
  MoreHorizontal, 
  Info,
  Download,
  Trash2,
  Copy,
  Check,
  ExternalLink
} from 'lucide-react';
import { formatDisplayModel, formatImageQualityLabel, formatPromptParagraphs, getAspectRatioFromSize } from '@/lib/drawing';

export default function ImageLightboxModal() {
  const { 
    previewTask, 
    previewQueue,
    setPreviewTask, 
    hubGenerations, 
    setQuickPrompt,
    setQuickRefImage,
    setHubGenMode,
    setCurrentView
  } = useAppStore();

  const [copied, setCopied] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

    const result = await permanentDeleteGeneration({
      id,
      taskId,
      dbId,
      resultUrl,
    });
    if (!result.ok) return;

    setPreviewTask(null);
  };

  // 🌟 严格计算当前上下文的翻页任务列表 (严格基于组内/当前批次队列，杜绝全局历史串扰)
  const successTasks = useMemo(() => {
    if (!previewTask) return [];

    // 1. 如果有显式传入的组内队列 (例如当前批次的 4 张图片)
    if (previewQueue && previewQueue.length > 0) {
      const validQueue = previewQueue.filter(t => t && t.resultUrl && (t.status === 'SUCCESS' || !t.status));
      if (validQueue.length > 0) {
        return validQueue;
      }
    }

    // 2. 兜底策略：如果同属一个 batchId，严格限制在当前同批次内
    if (previewTask.batchId) {
      const batchList = hubGenerations.filter(t => t.batchId === previewTask.batchId && t.status === 'SUCCESS' && t.resultUrl);
      if (batchList.length > 0) {
        return batchList;
      }
    }

    // 3. 兜底当前单张任务自身
    return [previewTask];
  }, [previewTask, previewQueue, hubGenerations]);

  const currentIndex = previewTask 
    ? successTasks.findIndex(t => t.id === previewTask.id || (previewTask.taskId && t.taskId === previewTask.taskId) || (t.resultUrl && t.resultUrl === previewTask.resultUrl)) 
    : -1;
  const total = successTasks.length;

  const handlePrev = () => {
    if (total > 1 && currentIndex >= 0) {
      const prevIdx = (currentIndex - 1 + total) % total;
      setPreviewTask(successTasks[prevIdx]);
    }
  };

  const handleNext = () => {
    if (total > 1 && currentIndex >= 0) {
      const nextIdx = (currentIndex + 1) % total;
      setPreviewTask(successTasks[nextIdx]);
    }
  };

  useEffect(() => {
    if (previewTask) {
      setShowMoreMenu(false);
      setCopied(false);
    }
  }, [previewTask?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!previewTask) return;
      if (e.key === 'Escape') {
        setPreviewTask(null);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        handlePrev();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        handleNext();
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
  }, [previewTask, currentIndex, successTasks, total, setPreviewTask, isVideo]);

  if (!previewTask || !previewTask.resultUrl) return null;

  // 日期格式化
  const dateStr = previewTask.createdAt 
    ? new Date(previewTask.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')
    : new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');

  const handleDownload = async () => {
    if (!previewTask?.resultUrl) return;
    const ext = isVideo ? 'mp4' : 'png';
    await downloadMediaOrOpen(
      previewTask.resultUrl,
      `beikeyuntu_${isVideo ? 'video' : 'image'}_${Date.now()}.${ext}`,
    );
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(previewTask.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteCurrent = handleDelete;

  // 做同款：填入提示词并切换到创作首页
  const handleUsePromptOnly = () => {
    setQuickPrompt(previewTask.prompt);
    if (isVideo) {
      setHubGenMode('video');
    } else {
      setHubGenMode('image');
    }
    setPreviewTask(null);
    setCurrentView('hub');
  };

  // 用作参考图：填入提示词与参考图并回到创作首页
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
    setCurrentView('hub');
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 lg:p-10 select-none font-sans animate-fade-in"
      onClick={() => setPreviewTask(null)}
    >
      {/* 🌟 居中对齐的主画框容器 (左侧媒体展示 + 左右大箭头 + 右侧浮动信息卡) */}
      <div 
        className="w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl max-h-[92vh] flex flex-col md:flex-row items-center justify-center gap-4 lg:gap-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 🌟 1. 左侧：全尺寸高清大图/大视频呈现 + 原生对称左右翻页控制器 */}
        <div className="flex-1 h-full max-h-[88vh] flex flex-col items-center justify-center relative min-w-0 group/canvas">
          <div className="relative flex items-center justify-center w-full min-h-0">
          {/* 左翻页按钮 (← 上一张，循环轮播) */}
          {total > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/55 hover:bg-black/85 text-white shadow-2xl border border-white/25 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer z-30 backdrop-blur-md group/btn"
              title="上一张 (←)"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.5] -translate-x-0.5 group-hover/btn:-translate-x-1 transition-transform" />
            </button>
          )}

          {/* 右翻页按钮 (→ 下一张，循环轮播) */}
          {total > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/55 hover:bg-black/85 text-white shadow-2xl border border-white/25 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer z-30 backdrop-blur-md group/btn"
              title="下一张 (→)"
            >
              <ChevronRight className="w-6 h-6 stroke-[2.5] translate-x-0.5 group-hover/btn:translate-x-1 transition-transform" />
            </button>
          )}

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
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.hasRetried && previewTask.resultUrl) {
                  target.dataset.hasRetried = 'true';
                  target.src = proxyMediaUrl(previewTask.resultUrl);
                }
              }}
              className="max-h-[86vh] w-auto max-w-full object-contain rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-white/60 select-none transition-all duration-300"
            />
          )}
          </div>

          {/* 套图页码：图片下方居中 */}
          {total > 1 && currentIndex >= 0 && (
            <div className="mt-3 shrink-0 pointer-events-none">
              <span className="px-3 py-1.5 rounded-full bg-black/65 backdrop-blur-md text-white text-sm font-mono font-bold shadow-lg border border-white/20">
                {currentIndex + 1} / {total}
              </span>
            </div>
          )}
        </div>

        {/* 🌟 2. 右侧：精致大方的信息与操作面板 */}
        <div className="w-full md:w-[350px] lg:w-[380px] xl:w-[400px] max-h-[86vh] bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200/90 flex flex-col justify-between flex-shrink-0 overflow-y-auto relative">
          
          <div className="space-y-4">
            {/* 顶部 Header: 左侧作者信息，右侧翻页胶囊与关闭按钮 (单行自适应弹性布局，彻底杜绝重叠) */}
            <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-[11px] shadow-xs shrink-0">
                  贝
                </div>
                <span className="text-xs font-bold text-slate-900 truncate">
                  贝壳云图
                </span>
              </div>

              {/* 右侧：关闭按钮 */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setPreviewTask(null)}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-all cursor-pointer"
                  title="关闭 (Esc)"
                >
                  <X className="w-4 h-4 stroke-[2.2]" />
                </button>
              </div>
            </div>

            {/* 日期与生成标记 + 点赞与更多操作 */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-sans">
              <span>{dateStr} | 内容由 AI 生成</span>
              <div className="flex items-center gap-2 relative">
                <div className="relative">
                  <button 
                    onClick={() => setShowMoreMenu(!showMoreMenu)}
                    className="text-slate-400 hover:text-slate-800 transition-colors cursor-pointer p-1 rounded-lg hover:bg-slate-100 flex items-center justify-center"
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
                          void openExternalUrl(previewTask.resultUrl!);
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
                  : formatImageQualityLabel(previewTask.quality)}
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
