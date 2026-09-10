import { useMemo } from 'react';
import { Trash2, Check, RotateCw, Loader2, AlertCircle, ImageIcon, Film, Layers, Music } from 'lucide-react';
import { formatDisplayModel, formatDisplayModelCompact, normalizeImageUrlToStandardJpg } from '@beike/shared/drawing';
import { proxyMediaUrl } from '@/lib/apiClient';
import '@/lib/downloadMedia';
import AIGeneratingCard from '@/shared/ui/AIGeneratingCard';
import { autoFillGrid, cardContainer } from '@/shared/ui/layoutClasses';
import { useViewportDensity } from '@/lib/useMediaQuery';
import Folder from '@/shared/media/Folder';
import LazyVideoCover from './LazyVideoCover';
import type { AssetTaskBatch } from './assetBatchUtils';

interface Props {
  mediaCategory: 'image' | 'video' | 'audio' | 'canvas';
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
  onOpenFolderBatch?: (batch: AssetTaskBatch) => void;
  section?: 'toolbar' | 'gallery' | 'both';
}

export default function AssetGenerationHistory(props: Props) {
  const {
    mediaCategory,
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
    setCurrentView,
    setPreviewTask,
    onDeleteBatch,
    onDeleteTask,
    onRegenerate,
    onOpenFolderBatch,
  } = props;

  const density = useViewportDensity();
  const showModelBadge = density === 'xl';

  const premiumGeneratingTaskId = useMemo(() => {
    const running = mergedTasks.find(
      (t) => (t.status === 'IN_PROGRESS' || t.status === 'PENDING' || !t.resultUrl)
        && t.status !== 'SUCCESS'
        && t.status !== 'FAILURE',
    );
    return running?.id ?? null;
  }, [mergedTasks]);

  function renderBatchCard(batch: AssetTaskBatch) {
    const isCanvas = batch.batchId.startsWith('canvas-') || mediaCategory === 'canvas';
    // 🌟 1. 单项任务直接平铺展示完整卡片（杜绝单任务/单视频被强行套上 1P 文件夹外壳，确保归类清晰直观）
    // 特别说明：如果是画布分类（用户明确要求：打包文件夹增加画布，存放的文件夹全放置画布的内容），则即使只有 1 张图也保持为 Folder 文件夹！
    if (batch.tasks.length <= 1 && !isCanvas) {
      return batch.tasks[0] ? renderTaskCard(batch.tasks[0]) : null;
    }

    const validTasks = batch.tasks.filter(t => t.resultUrl && (t.status === 'SUCCESS' || !t.status));
    const runningTasks = batch.tasks.filter(t => (t.status === 'IN_PROGRESS' || t.status === 'PENDING') && !t.resultUrl);
    const failedTasks = batch.tasks.filter(t => t.status === 'FAILURE' && !t.resultUrl);

    const primaryTask = validTasks[0] || batch.tasks[0];
    const isAllSelected = batch.tasks.every(t => selectedTaskIds.includes(t.id));
    const isSomeSelected = batch.tasks.some(t => selectedTaskIds.includes(t.id));
    const isVid = batch.tasks.some(
      (t) =>
        t.mediaType === 'video' ||
        t.mediaType === 'depth-video' ||
        t.resultUrl?.includes('.mp4') ||
        t.model?.includes('video') ||
        t.model?.includes('seedance') ||
        t.model === 'video-depth-anything'
    );
    const isAud = batch.tasks.some((t) => t.mediaType === 'audio' || t.resultUrl?.includes('.mp3') || t.resultUrl?.includes('.wav'));
    const isDoc = batch.tasks.some((t) => t.mediaType === 'doc' || t.mediaType === 'document' || t.resultUrl?.includes('.pdf'));

    const mediaUnit = isCanvas ? '张画布内容' : isVid ? '段视频' : isAud ? '首音频' : isDoc ? '篇文档' : '张图片';
    const runningUnit = isCanvas ? '张' : isVid ? '段' : isAud ? '首' : isDoc ? '篇' : '张';
    const badgeSuffix = isCanvas ? 'P' : isVid ? 'V' : isAud ? 'A' : isDoc ? 'D' : 'P';

    const modelFull = formatDisplayModel(batch.model, isVid);
    const modelCompact = formatDisplayModelCompact(batch.model, isVid);

    // 1. 若当前批次没有任何有效成功的媒体
    if (validTasks.length === 0) {
      // 1.1 若正在批量生成中（对齐生成对话界面，去除深色沉重背景框，只保留纯粹呼吸动效卡片）
      if (runningTasks.length > 0) {
        return (
          <div
            key={batch.batchId}
            className={`${cardContainer} group relative rounded-xl sm:rounded-2xl overflow-hidden aspect-square select-none shadow-2xs hover:shadow-md transition-all duration-200 border border-sky-200/70 bg-sky-50/20`}
          >
            <div className="absolute inset-0">
              <AIGeneratingCard
                task={primaryTask}
                progressNumber={
                  primaryTask?.progress && primaryTask.progress.includes('%')
                    ? parseInt(primaryTask.progress, 10)
                    : undefined
                }
                showProgressBadge={true}
                isVideo={isVid}
                variant={primaryTask?.id === premiumGeneratingTaskId ? 'premium' : 'lite'}
              />
            </div>
            {/* 多图/多视频任务角标（极简半透明毛玻璃胶囊） */}
            {runningTasks.length > 1 && (
              <div className="absolute top-2.5 right-2.5 z-20 pointer-events-none animate-in fade-in duration-200">
                <span className="px-2 py-0.5 rounded-lg bg-white/80 backdrop-blur-md border border-white/80 text-sky-800 text-[10px] font-bold font-mono shadow-2xs">
                  {runningTasks.length}{runningUnit}
                </span>
              </div>
            )}
          </div>
        );
      }

      // 1.2 若全部失败或中断 (杜绝纯白空白框！)
      return (
        <div
          key={batch.batchId}
          className={`${cardContainer} group relative rounded-2xl overflow-hidden bg-slate-50 border border-slate-200 shadow-2xs aspect-square select-none flex flex-col justify-between p-3`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>生成未完成 ({batch.tasks.length})</span>
            </span>
            <button
              type="button"
              onClick={(e) => onDeleteBatch(batch, e)}
              className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="清理此异常记录"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 text-center my-auto px-2">
            <span className="text-xs font-bold text-slate-600">任务中断或失败</span>
            <span className="text-[10px] text-slate-400 line-clamp-2">{batch.title || batch.prompt || '暂无可用图像'}</span>
          </div>
          <button
            type="button"
            onClick={(e) => onDeleteBatch(batch, e)}
            className="w-full py-1 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-[10px] font-bold transition-colors cursor-pointer text-center"
          >
            清理记录
          </button>
        </div>
      );
    }

    // 2. 🌟 拥有有效生成图片的套组：以极具质感且高性能的 Folder 文件夹形式展示
    const totalCount = batch.tasks.length;
    const validCount = validTasks.length;
    const coverTask = validTasks[0] || batch.tasks[0];
    const coverUrl = coverTask?.resultUrl ? proxyMediaUrl(normalizeImageUrlToStandardJpg(coverTask.resultUrl), { thumb: true, width: 320 }) : undefined;
    const previewItems = validTasks.slice(0, 3).map((t) => proxyMediaUrl(normalizeImageUrlToStandardJpg(t.resultUrl), { thumb: true, width: 320 }));
    const folderDisplayName = (batch.title || batch.prompt || '未命名对话').trim();

    const handleOpenBatch = () => {
      if (isBatchMode) {
        if (isAllSelected) {
          const batchTaskIds = new Set(batch.tasks.map(t => t.id));
          setSelectedTaskIds(prev => prev.filter(id => !batchTaskIds.has(id)));
        } else {
          const newIds = batch.tasks.map(t => t.id);
          setSelectedTaskIds(prev => Array.from(new Set([...prev, ...newIds])));
        }
      } else {
        if (onOpenFolderBatch) onOpenFolderBatch(batch);
        else setPreviewTask(primaryTask, validTasks);
      }
    };

    return (
      <div
        key={batch.batchId}
        onMouseEnter={() => {
          // 🌟 悬浮预热预加载 3D 轮播所需的 320px 缩略图，进入浏览器高速缓存，点击即秒开
          validTasks.forEach((t) => {
            if (t.resultUrl) {
              const img = new Image();
              img.src = proxyMediaUrl(normalizeImageUrlToStandardJpg(t.resultUrl), { thumb: true, width: 320 });
            }
          });
        }}
        onClick={handleOpenBatch}
        className={`group relative cursor-pointer aspect-square flex flex-col items-center justify-between p-2 select-none will-change-transform ${
          isAllSelected ? 'ring-2 ring-indigo-600 rounded-2xl bg-indigo-50/20' : ''
        }`}
      >
        {/* 多选框（仅在批量模式下显示） */}
        {isBatchMode && (
          <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5">
            <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all shadow-xs ${
              isAllSelected ? 'bg-indigo-600 text-white' : isSomeSelected ? 'bg-indigo-100 text-indigo-700 border border-indigo-400' : 'bg-white/90 border border-slate-300'
            }`}>
              {isAllSelected ? <Check className="w-3 h-3 stroke-[3]" /> : isSomeSelected ? <div className="w-2 h-2 bg-indigo-600 rounded-xs" /> : null}
            </div>
          </div>
        )}

        {/* 🌟 核心 Folder 文件夹组件展示（上半部分） */}
        <div className="w-full flex-1 min-h-0 flex items-center justify-center pt-0.5 pb-0 -mt-1">
          <Folder
            color={isCanvas ? '#0EA5E9' : isVid ? '#2563EB' : '#4F46E5'}
            size={1.05}
            count={validCount}
            badgeSuffix={badgeSuffix}
            items={previewItems}
            coverImage={coverUrl}
            expandOnClick={false}
            onClick={handleOpenBatch}
          />
        </div>

        {/* 🌟 底部对话名称与微标签（向下移位、拉开呼吸空间、提高清晰度、动态适配媒体类型单位） */}
        <div className="w-full flex flex-col items-center justify-center px-2 pt-2.5 pb-1 text-center pointer-events-none shrink-0">
          <span
            className="w-full text-[12.5px] sm:text-[13px] font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 transition-colors truncate tracking-tight text-center leading-tight"
            title={folderDisplayName}
          >
            {folderDisplayName}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate mt-1 leading-none">
            {runningTasks.length > 0
              ? `${validCount}/${totalCount} ${runningUnit} (生成中)`
              : failedTasks.length > 0
                ? `${validCount} ${mediaUnit} (${failedTasks.length}张失败)`
                : `${validCount} ${mediaUnit}`} · {modelCompact}
          </span>
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
    void isFailed;

    const isVidTask = task.mediaType === 'video' || task.mediaType === 'depth-video' || task.resultUrl?.includes('.mp4');
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
            const isVid = task.mediaType === 'video' || task.mediaType === 'depth-video' || (task.resultUrl && (task.resultUrl.includes('.mp4') || task.resultUrl.includes('video')));
            const raw = task.rawTask || {};
            const refImgs = task.referenceImages || raw.referenceImages || task.images || raw.images;
            const refImgUrl = task.referenceImageUrl || raw.referenceImageUrl || task.sourceImageUrl || raw.sourceImageUrl;
            const previewPayload = {
              ...task,
              id: task.id,
              dbId: task.dbId,
              taskId: task.taskId,
              batchId: task.batchId || raw.batchId,
              sessionId: task.sessionId || raw.sessionId,
              title: task.title || (task.prompt ? (task.prompt.slice(0, 24) + '...') : (isVid ? '历史生成视频' : '历史生成图片')),
              prompt: task.prompt,
              status: 'SUCCESS',
              resultUrl: task.resultUrl,
              model: task.model || (isVid ? 'doubao-seedance-2.5' : 'gpt-image-2'),
              mediaType: isVid ? 'video' : 'image',
              size: task.size || task.aspectRatio || '3:4',
              aspectRatio: task.aspectRatio || task.size || '3:4',
              quality: task.quality || (isVid ? '720P' : 'medium'),
              videoResolution: task.videoResolution || (isVid ? (task.quality || '720P') : undefined),
              videoDuration: task.videoDuration,
              referenceImages: refImgs,
              referenceImageUrl: refImgUrl,
              images: task.images || refImgs,
              sourceImageUrl: task.sourceImageUrl || refImgUrl,
              useReferenceImage: Boolean((refImgs && refImgs.length > 0) || refImgUrl || task.useReferenceImage),
              rawTask: task.rawTask || task,
              progress: '100%',
              createdAt: task.createdAt ? new Date(task.createdAt).getTime() : Date.now(),
            };

            // 🌟 寻找同批次兄弟任务构建队列，使得单张卡片点入也能左右翻页并共享参考素材
            const siblingTasks = mergedTasks.filter((t: any) => {
              if (!t.resultUrl) return false;
              if (task.batchId && t.batchId === task.batchId) return true;
              if (task.sessionId && t.sessionId === task.sessionId) return true;
              return false;
            });
            const queue = siblingTasks.length > 1 ? siblingTasks : [previewPayload];
            setPreviewTask(previewPayload, queue);
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
          <div className="absolute top-2 right-2 z-20 pointer-events-none hidden @min-[160px]/card:block max-w-[calc(100%-0.5rem)]">
            <span
              className="px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-xs text-white text-[9px] font-mono font-medium shadow-xs truncate block max-w-full"
              title={taskModelFull}
            >
              {taskModelCompact}
            </span>
          </div>
        )}


        {/* Card Main Media */}
        <div className="w-full h-full relative overflow-hidden bg-slate-100 flex items-center justify-center">
          {isSuccess ? (
            (task.mediaType === 'video' || task.mediaType === 'depth-video' || task.resultUrl?.includes('.mp4')) ? (
              <LazyVideoCover src={proxyMediaUrl(task.resultUrl)} />
            ) : (
              <img 
                src={proxyMediaUrl(normalizeImageUrlToStandardJpg(task.resultUrl), { thumb: true, width: 480 })} 
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
                className="w-full h-full object-cover" 
              />
            )
          ) : isRunning ? (
            <AIGeneratingCard
              task={task}
              progressNumber={
                task?.progress && task.progress.includes('%')
                  ? parseInt(task.progress, 10)
                  : undefined
              }
              showProgressBadge={true}
              isVideo={task.mediaType === 'video' || task.mediaType === 'depth-video' || task.resultUrl?.includes('.mp4')}
              variant={task.id === premiumGeneratingTaskId ? 'premium' : 'lite'}
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 p-4 text-center text-red-500 overflow-x-hidden">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <span className="text-[10px] font-bold">{
                task.mediaType === 'depth-video'
                  ? '深度视频生成失败'
                  : task.mediaType === 'depth-image'
                    ? '深度图片生成失败'
                    : task.mediaType === 'video'
                      ? '视频生成失败'
                      : '生图失败'
              }</span>
              <span
                className="text-[9px] text-slate-400 w-full min-w-0 line-clamp-3 break-words [overflow-wrap:anywhere] leading-relaxed"
                title={task.failReason || '网络异常'}
              >
                {task.failReason || '网络异常'}
              </span>
            </div>
          )}
        </div>

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
      );
    }

  return (
    <div className="space-y-8 animate-fade-in">
      {mergedTasks.length === 0 ? (
        <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400">
            {mediaCategory === 'canvas' ? (
              <Layers className="w-8 h-8 text-sky-500" />
            ) : mediaCategory === 'video' ? (
              <Film className="w-8 h-8" />
            ) : mediaCategory === 'audio' ? (
              <Music className="w-8 h-8" />
            ) : (
              <ImageIcon className="w-8 h-8" />
            )}
          </div>
          <div className="space-y-1">
            <span className="font-bold text-slate-700 text-sm">
              {mediaCategory === 'canvas' ? '暂无画布资产' : mediaCategory === 'video' ? '暂无生成视频资产' : mediaCategory === 'audio' ? '暂无音频资产' : '暂无生成历史资产'}
            </span>
            <p className="text-xs text-slate-500">
              {mediaCategory === 'canvas'
                ? '在无限画布中创作并生成的图片工程将自动在此归档'
                : mediaCategory === 'video'
                ? '在工作区生成的商用视频将自动在此沉淀归档'
                : mediaCategory === 'audio'
                ? '在工作区提取或生成的音频素材将自动在此归档'
                : '在工作区生成的商用美图与视觉资产将自动在此沉淀归档'}
            </p>
          </div>
          <button
            onClick={() => setCurrentView(mediaCategory === 'canvas' ? 'canvas' : 'home')}
            className="mt-2 px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-black transition-all shadow-sm cursor-pointer"
          >
            {mediaCategory === 'canvas' ? '前往无限画布创作 ➔' : '去灵感大厅生成 ➔'}
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
  );
}
