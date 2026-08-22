'use client';
import {
  Trash2,
  Download,
  Copy,
  Check,
  RotateCw,
  Loader2,
  AlertCircle,
  ImageIcon,
  ChevronDown,
  Film,
  Layers,
  ArrowUpDown,
  Maximize2,
} from 'lucide-react';
import { formatDisplayModel, formatDisplayModelCompact, normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { proxyMediaUrl } from '@/lib/apiClient';
import { downloadMediaOrOpen } from '@/lib/downloadMedia';
import AIGeneratingCard from '@/shared/ui/AIGeneratingCard';
import { useAppStore } from '@/store/useAppStore';
import { autoFillGrid, cardContainer, subToolbar } from '@/shared/ui/layoutClasses';
import LazyVideoCover from './LazyVideoCover';
import type { AssetTaskBatch } from './assetBatchUtils';

interface Props {
  mediaCategory: 'image' | 'video' | 'audio' | 'doc';
  setMediaCategory: (v: 'image' | 'video' | 'audio' | 'doc') => void;
  taskTypeFilter: 'all' | 'text2img' | 'img2img' | 'buyer_show';
  setTaskTypeFilter: (v: 'all' | 'text2img' | 'img2img' | 'buyer_show') => void;
  timeFilter: 'all' | 'today' | 'yesterday' | '7days' | '30days';
  setTimeFilter: (v: 'all' | 'today' | 'yesterday' | '7days' | '30days') => void;
  sortOrder: 'desc' | 'asc';
  setSortOrder: (v: 'desc' | 'asc') => void;
  mergedTasks: any[];
  visibleToday: AssetTaskBatch[];
  visibleYesterday: AssetTaskBatch[];
  visibleEarlier: AssetTaskBatch[];
  hasMore: boolean;
  renderedBatches: number;
  totalBatches: number;
  loadMoreSentinelRef: React.RefObject<HTMLDivElement | null>;
  isBatchMode: boolean;
  selectedTaskIds: string[];
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  setIsBatchMode: (v: boolean) => void;
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
  setCurrentView: (view: any) => void;
  setPreviewTask: (...args: any[]) => void;
  setQuickPrompt: (prompt: string) => void;
  showToast: (msg: string) => void;
  onDeleteBatch: (batch: AssetTaskBatch, e: React.MouseEvent) => void;
  onDeleteTask: (taskOrId: any, e?: React.MouseEvent) => void;
  onRegenerate: (task: any, e: React.MouseEvent) => void;
  section?: 'toolbar' | 'gallery' | 'both';
}

export default function AssetGenerationHistory(props: Props) {
  const {
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
    onDeleteBatch,
    onDeleteTask,
    onRegenerate,
    section = 'both',
  } = props;

  function renderBatchCard(batch: AssetTaskBatch) {
    if (batch.tasks.length === 1) {
      return renderTaskCard(batch.tasks[0]);
    }

    const primaryTask = batch.tasks[0];
    const isAllSelected = batch.tasks.every(t => selectedTaskIds.includes(t.id));
    const isSomeSelected = batch.tasks.some(t => selectedTaskIds.includes(t.id));
    const isVid = batch.tasks.some(t => t.mediaType === 'video' || t.resultUrl?.includes('.mp4'));
    const coverUrl = primaryTask?.resultUrl || batch.tasks.find(t => t.resultUrl)?.resultUrl;
    const isCoverVideo = primaryTask?.mediaType === 'video' || coverUrl?.includes('.mp4');

    const modelFull = formatDisplayModel(batch.model, isVid);
    const modelCompact = formatDisplayModelCompact(batch.model, isVid);

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
            // 点击直接打开全屏大图预览本套组 (左右流畅翻页)
            if (primaryTask?.resultUrl) {
              setPreviewTask(primaryTask, batch.tasks);
            }
          }
        }}
        className={`${cardContainer} group relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/80 shadow-2xs cursor-pointer aspect-square select-none will-change-transform transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
          isAllSelected ? 'ring-2 ring-indigo-600 border-indigo-500' : 'hover:border-slate-300'
        }`}
      >
        {/* 套图叠层视觉：暗示多张，非单张 */}
        {!isBatchMode && batch.tasks.length > 1 && (
          <>
            <div className="absolute inset-0 rounded-2xl border border-white/70 bg-white/40 translate-x-1 translate-y-1 -z-10 shadow-sm pointer-events-none" />
            <div className="absolute inset-0 rounded-2xl border border-white/50 bg-white/25 translate-x-2 translate-y-2 -z-20 shadow-sm pointer-events-none" />
          </>
        )}

        {/* Top-left: Selection or Batch Badge — 随卡片宽度分层显示 */}
        <div className={`absolute top-2 left-2 z-30 flex items-center gap-1.5 pointer-events-none max-w-[calc(100%-2.5rem)] @min-[160px]/card:max-w-[calc(100%-3.5rem)]`}>
          {isBatchMode ? (
            <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all shadow-xs pointer-events-auto ${
              isAllSelected ? 'bg-indigo-600 text-white' : isSomeSelected ? 'bg-indigo-100 text-indigo-700 border border-indigo-400' : 'bg-white/90 border border-slate-300'
            }`}>
              {isAllSelected ? <Check className="w-3 h-3 stroke-[3]" /> : isSomeSelected ? <div className="w-2 h-2 bg-indigo-600 rounded-xs" /> : null}
            </div>
          ) : (
            <span
              className="px-1.5 py-1 @min-[160px]/card:px-2.5 rounded-lg bg-indigo-600/95 backdrop-blur-md text-white text-[11px] font-bold flex items-center gap-1 shadow-md border border-white/20 min-w-0"
              title={`套图 ${batch.tasks.length} 张 · ${modelFull}`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden @min-[160px]/card:inline truncate">套图 · {batch.tasks.length}</span>
              <span className="hidden @min-[220px]/card:inline truncate">张</span>
            </span>
          )}
        </div>

        {/* Bottom-right: 始终可见的数量角标（窄卡片时为主要计数提示） */}
        {!isBatchMode && batch.tasks.length > 1 && (
          <div className="absolute bottom-2 right-2 z-30 pointer-events-none @min-[220px]/card:opacity-100">
            <span className="min-w-[2rem] h-7 px-2 rounded-lg bg-black/75 backdrop-blur-md text-white text-xs font-mono font-bold flex items-center justify-center shadow-lg border border-white/15">
              ×{batch.tasks.length}
            </span>
          </div>
        )}

        {/* Top-right Model Badge — 窄卡片隐藏，避免与套图角标重叠 */}
        {!isBatchMode && (
        <div className="absolute top-2 right-2 z-30 pointer-events-none hidden @min-[160px]/card:block max-w-[calc(100%-3rem)]">
          <span
            className="px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-xs text-white text-[9px] font-mono font-medium shadow-xs border border-white/10 max-w-[5.5rem] @min-[220px]/card:max-w-[7rem] truncate block"
            title={modelFull}
          >
            {modelCompact}
          </span>
        </div>
        )}

        {/* Cover Media */}
        <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
          {coverUrl ? (
            isCoverVideo ? (
              <div className="w-full h-full">
                <LazyVideoCover src={coverUrl} />
              </div>
            ) : (
              <img 
                src={normalizeImageUrlToStandardJpg(coverUrl)} 
                alt="" 
                loading="lazy" 
                decoding="async"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.hasRetried && coverUrl) {
                    target.dataset.hasRetried = 'true';
                    target.src = proxyMediaUrl(coverUrl);
                  } else {
                    target.src = '/inspirations/insp_1.jpg';
                  }
                }}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
              />
            )
          ) : (
            <div className="w-full h-full">
              <AIGeneratingCard task={primaryTask} isVideo={isCoverVideo} />
            </div>
          )}

          {/* Hover Overlay — 底部紧凑布局，避免小卡片内上下挤压重叠 */}
          {!isBatchMode && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2.5 flex flex-col justify-end gap-2 z-30 pointer-events-auto">
            <p className="text-[10px] text-slate-300 truncate">
              套组 · {batch.tasks.length} 张 · {formatDisplayModel(batch.model, isVid)} · {new Date(batch.createdAt).toLocaleDateString()}
            </p>
            <p className="text-[10px] text-white/95 line-clamp-1 leading-tight font-medium">
              {batch.prompt || batch.title || '批量成套生成'}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (primaryTask?.resultUrl) {
                    setPreviewTask(primaryTask, batch.tasks);
                  }
                }}
                className="flex-1 min-w-0 py-1.5 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold text-center flex items-center justify-center gap-1 shadow-sm cursor-pointer transition-all active:scale-95"
                title="全屏大图逐张查看"
              >
                <Maximize2 className="w-3 h-3 shrink-0" />
                <span className="truncate">预览 ({batch.tasks.length})</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuickPrompt(batch.prompt);
                  useAppStore.getState().setCurrentView('hub');
                  showToast('✨ 已复用提示词');
                }}
                className="w-8 h-8 shrink-0 rounded-xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="复用提示词"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => onDeleteBatch(batch, e)}
                className="w-8 h-8 shrink-0 rounded-xl bg-white/20 hover:bg-red-600 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="删除整套"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          )}
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

    const isVidTask = task.mediaType === 'video' || task.resultUrl?.includes('.mp4');
    const taskModelFull = formatDisplayModel(task.model, isVidTask);
    const taskModelCompact = formatDisplayModelCompact(task.model, isVidTask);

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
              quality: task.quality || (isVid ? '720P' : 'medium'),
              videoResolution: task.videoResolution || (isVid ? (task.quality || '720P') : undefined),
              videoDuration: task.videoDuration,
              useReferenceImage: false,
              progress: '100%',
              createdAt: task.createdAt ? new Date(task.createdAt).getTime() : Date.now()
            });
          }
        }}
        className={`${cardContainer} group relative rounded-xl sm:rounded-2xl overflow-hidden bg-slate-100 border transition-all duration-200 cursor-pointer aspect-square flex flex-col justify-between shadow-2xs hover:shadow-lg hover:-translate-y-0.5 select-none [content-visibility:auto] [contain-intrinsic-size:200px] will-change-transform ${
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

        {/* Top-right Model Tag — 窄卡片隐藏 */}
        {!isRunning && !isBatchMode && (
          <div className="absolute top-2 right-2 z-20 pointer-events-none group-hover:opacity-0 transition-opacity duration-200 hidden @min-[160px]/card:block max-w-[calc(100%-0.5rem)]">
            <span
              className="px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-xs text-white text-[9px] font-mono font-medium shadow-xs truncate block max-w-full"
              title={taskModelFull}
            >
              {taskModelCompact}
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
              <LazyVideoCover src={task.resultUrl} />
            ) : (
              <img 
                src={normalizeImageUrlToStandardJpg(task.resultUrl)} 
                alt="" 
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.hasRetried && task.resultUrl) {
                    target.dataset.hasRetried = 'true';
                    target.src = proxyMediaUrl(task.resultUrl);
                  } else {
                    target.src = '/inspirations/insp_1.jpg';
                  }
                }}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
              />
            )
          ) : isRunning ? (
            <AIGeneratingCard 
              task={task} 
              isVideo={task.mediaType === 'video' || task.resultUrl?.includes('.mp4')} 
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 p-4 text-center text-red-500 overflow-x-hidden">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <span className="text-[10px] font-bold">{task.mediaType === 'video' ? '视频生成失败' : '生图失败'}</span>
              <span
                className="text-[9px] text-slate-400 w-full min-w-0 line-clamp-3 break-words [overflow-wrap:anywhere] leading-relaxed"
                title={task.failReason || '网络异常'}
              >
                {task.failReason || '网络异常'}
              </span>
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
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!task.resultUrl) return;
                      const isVid = task.mediaType === 'video' || task.resultUrl?.includes('.mp4');
                      const ext = isVid ? 'mp4' : 'png';
                      await downloadMediaOrOpen(
                        task.resultUrl,
                        `beikeyuntu_${isVid ? 'video' : 'image'}_${Date.now()}.${ext}`,
                      );
                    }}
                    className="w-6 h-6 rounded-md bg-black/60 hover:bg-white hover:text-black text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                    title={task.mediaType === 'video' ? "下载高清视频" : "下载原图"}
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => onDeleteTask(task, e)}
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
                    onClick={(e) => onRegenerate(task, e)}
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
                  onClick={(e) => onDeleteTask(task, e)}
                  className="w-7 h-7 rounded-lg bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                  title="删除/清除此记录"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1 pt-1">
                {task.prompt && (
                  <button
                    onClick={(e) => onRegenerate(task, e)}
                    className="flex-1 py-1 rounded-lg bg-white/90 hover:bg-white text-slate-900 text-[10px] font-bold shadow-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>重试生成</span>
                  </button>
                )}
                <button
                  onClick={(e) => onDeleteTask(task, e)}
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

  return (
    <>
      {(section === 'toolbar' || section === 'both') && (
        <div className="px-6 lg:px-8 py-2.5 bg-white border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-y-2 gap-x-3 flex-shrink-0 text-xs min-w-0">
          {/* Media Types */}
          <div className={`${subToolbar} shrink-0`}>
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
          <div className={`${subToolbar} lg:justify-end`}>
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
      {(section === 'gallery' || section === 'both') && (
          <div className="space-y-8 animate-fade-in">
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
                    {visibleToday.length > 0 && (
                      <div className="space-y-4">
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight pb-0.5">
                          今天
                        </h2>
                        <div className={`${autoFillGrid} pt-1`}>
                          {visibleToday.map(batch => renderBatchCard(batch))}
                        </div>
                      </div>
                    )}

                    {/* 2. 昨天 分组 */}
                    {visibleYesterday.length > 0 && (
                      <div className="space-y-4">
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight pb-0.5">
                          昨天
                        </h2>
                        <div className={`${autoFillGrid} pt-1`}>
                          {visibleYesterday.map(batch => renderBatchCard(batch))}
                        </div>
                      </div>
                    )}

                    {/* 3. 更早 分组 */}
                    {visibleEarlier.length > 0 && (
                      <div className="space-y-4">
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight pb-0.5">
                          更早
                        </h2>
                        <div className={`${autoFillGrid} pt-1`}>
                          {visibleEarlier.map(batch => renderBatchCard(batch))}
                        </div>
                      </div>
                    )}

                    {/* 🌟 底部平滑无限加载哨兵 (秒级自适应加载下一页，杜绝 DOM 爆炸卡顿) */}
                    {hasMore && (
                      <div ref={loadMoreSentinelRef} className="py-8 flex items-center justify-center text-xs text-slate-400 gap-2 select-none">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                        <span>正在加载更多历史资产 (已渲染 {renderedBatches} / 共 {totalBatches} 批)...</span>
                      </div>
                    )}
                  </>
                )}
          </div>

      )}
    </>
  );
}
