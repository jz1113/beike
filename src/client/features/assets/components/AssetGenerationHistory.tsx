import { AlertCircle, Check, Film, ImageIcon, Layers, Loader2, Music, Trash2 } from 'lucide-react';
import { formatDisplayModelCompact } from '@shared/domain/media/drawing';
import AIGeneratingCard from '@client/shared/ui/AIGeneratingCard';
import { autoFillGrid } from '@client/shared/ui/layoutClasses';
import Folder from '@client/shared/media/Folder';
import AssetMediaPreview from './AssetMediaPreview';
import AssetTaskCard from './AssetTaskCard';
import { getAssetMediaKind, isAssetTaskRunning } from '../model/assetMedia';
import type { AssetTaskBatch } from '../model/assetBatch';

type Task = AssetTaskBatch['tasks'][number];
interface Props {
  isPreparing?: boolean;
  mediaCategory: 'image' | 'video' | 'audio' | 'canvas';
  mergedTasks: Task[];
  visibleToday: AssetTaskBatch[];
  visibleYesterday: AssetTaskBatch[];
  visibleEarlier: AssetTaskBatch[];
  hasMore: boolean;
  renderedBatches: number;
  totalBatches: number;
  loadMoreSentinelRef: React.RefObject<HTMLDivElement | null>;
  isBatchMode: boolean;
  isBusy?: boolean;
  isSearchingHistory?: boolean;
  tasksHasMore?: boolean;
  onLoadMore?: () => void;
  selectedTaskIds: string[];
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  setCurrentView: (view: 'canvas' | 'home') => void;
  setPreviewTask: (task: Task, queue?: Task[]) => void;
  onDeleteBatch: (batch: AssetTaskBatch, e: React.MouseEvent) => void;
  onDeleteTask: (task: Task, e?: React.MouseEvent) => void;
  onRegenerate: (task: Task, e: React.MouseEvent) => void;
  onOpenFolderBatch?: (batch: AssetTaskBatch) => void;
  isLoadingTasks?: boolean;
  isLoadingMoreTasks?: boolean;
  loadError?: string | null;
  isFiltered?: boolean;
  onRetryLoad?: () => void;
  showToast?: (message: string) => void;
}

export default function AssetGenerationHistory(props: Props) {
  const { isPreparing, mediaCategory, mergedTasks, visibleToday, visibleYesterday, visibleEarlier, hasMore, renderedBatches, totalBatches, loadMoreSentinelRef, isBatchMode, isBusy, isSearchingHistory, tasksHasMore, onLoadMore, selectedTaskIds, setSelectedTaskIds, setCurrentView, setPreviewTask, onDeleteBatch, onDeleteTask, onRegenerate, onOpenFolderBatch, isLoadingTasks, isLoadingMoreTasks, loadError, isFiltered, onRetryLoad, showToast } = props;

  function renderBatchCard(batch: AssetTaskBatch) {
    const isCanvas = batch.batchId.startsWith('canvas-') || mediaCategory === 'canvas';
    if (batch.tasks.length <= 1 && !isCanvas) {
      return batch.tasks[0] ? <AssetTaskCard key={batch.batchId} task={batch.tasks[0]} {...{ mergedTasks, isBatchMode, isBusy, selectedTaskIds, setSelectedTaskIds, setPreviewTask, onDeleteTask, onRegenerate, showToast }} /> : null;
    }
    const validTasks = batch.tasks.filter(t => t.resultUrl && t.status !== 'FAILURE');
    const runningTasks = batch.tasks.filter(isAssetTaskRunning);
    const failedTasks = batch.tasks.filter(t => t.status === 'FAILURE');
    const emptyTasks = batch.tasks.filter(t => t.status === 'EMPTY');
    const primaryTask = runningTasks[0] || validTasks[0] || batch.tasks[0];
    const title = (batch.title || batch.prompt || '未命名套组').trim();
    const allSelected = batch.tasks.length > 0 && batch.tasks.every(t => selectedTaskIds.includes(t.id));
    const someSelected = batch.tasks.some(t => selectedTaskIds.includes(t.id));
    const kinds = new Set(batch.tasks.map(getAssetMediaKind));
    const kind = kinds.size === 1 ? getAssetMediaKind(primaryTask || {}) : 'mixed';
    const unit = isCanvas || kind === 'mixed' ? '项内容' : kind === 'video' ? '段视频' : kind === 'audio' ? '首音频' : kind === 'document' ? '篇文档' : '张图片';
    const model = formatDisplayModelCompact(batch.model, kind === 'video');
    const status = runningTasks.length ? `${validTasks.length}/${batch.tasks.length} 项完成 · ${runningTasks.length} 项生成中`
      : failedTasks.length ? `${validTasks.length} ${unit} · ${failedTasks.length} 项失败`
      : emptyTasks.length ? `${validTasks.length} ${unit} · ${emptyTasks.length} 项待添加媒体` : `${validTasks.length} ${unit}`;

    const openBatch = () => {
      if (isBusy) return;
      if (isBatchMode) {
        const ids = new Set(batch.tasks.map(t => t.id));
        setSelectedTaskIds(prev => allSelected ? prev.filter(id => !ids.has(id)) : Array.from(new Set([...prev, ...ids])));
      } else if (onOpenFolderBatch) onOpenFolderBatch(batch);
      else if (validTasks.length) setPreviewTask(validTasks[0], validTasks);
    };

    return (
      <div
        key={batch.batchId}
        className={`group relative flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-between rounded-2xl p-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 ${allSelected ? 'bg-indigo-50/30 ring-2 ring-indigo-600' : ''}`}
      >
        <button type="button" onClick={openBatch} disabled={isBusy} aria-label={`${isBatchMode ? '选择' : '打开文件夹'}：${title}，${batch.tasks.filter(t => !t.isCanvasPlaceholder).length} 项内容`} aria-pressed={isBatchMode ? allSelected : undefined} className="absolute inset-0 z-20 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-wait" />
        {isBatchMode && <div aria-hidden="true" className={`pointer-events-none absolute left-2 top-2 z-30 flex h-5 w-5 items-center justify-center rounded-md shadow-xs ${allSelected ? 'bg-indigo-600 text-white' : someSelected ? 'border border-indigo-400 bg-indigo-100 text-indigo-700' : 'border border-slate-300 bg-white/90'}`}>{allSelected ? <Check className="h-3 w-3" /> : someSelected ? <span className="h-2 w-2 rounded-xs bg-indigo-600" /> : null}</div>}
        {!isBatchMode && <button type="button" disabled={isBusy} onClick={e => { e.stopPropagation(); onDeleteBatch(batch, e); }} title="删除文件夹" aria-label={`删除文件夹：${title}`} className="absolute right-1 top-1 z-30 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-white/90 text-slate-500 opacity-0 shadow-xs transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
        <div className="flex w-full min-h-0 flex-1 items-center justify-center">
          {validTasks.length > 0 ? (
            <Folder
              color={isCanvas ? '#0EA5E9' : kind === 'video' ? '#2563EB' : '#4F46E5'}
              size={1.05}
              count={validTasks.length}
              badgeSuffix={isCanvas || kind === 'mixed' ? '项' : kind === 'video' ? 'V' : kind === 'audio' ? 'A' : kind === 'document' ? 'D' : 'P'}
              items={validTasks.slice(0, 3).map(t => <AssetMediaPreview key={t.id} src={t.resultUrl} mediaType={t.mediaType} model={t.model} width={320} title={title} videoAutoPlay={false} posterUrl={t.coverUrl} />)}
              interactive={false}
            />
          ) : runningTasks.length > 0 ? (
            <div className="relative h-full min-h-20 w-full overflow-hidden rounded-xl">
              <AIGeneratingCard task={primaryTask} showProgressBadge={Boolean(primaryTask?.progress)} badgePosition={isBatchMode ? 'right' : 'left'} />
              <span role="status" className="absolute inset-x-1 bottom-3 text-center text-[11px] text-sky-800">{runningTasks.length} 项正在生成</span>
            </div>
          ) : (
            <div className="flex h-full min-h-20 w-full flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-center">
              {isCanvas && (emptyTasks.length || batch.tasks.some(t => t.isCanvasPlaceholder)) ? <Layers className="h-6 w-6 text-sky-500" /> : <AlertCircle className="h-6 w-6 text-rose-500" />}<span className="text-xs font-semibold text-slate-600">{isCanvas && batch.tasks.some(t => t.isCanvasPlaceholder) ? '空画布项目' : emptyTasks.length ? '尚未添加媒体' : failedTasks.length ? '生成失败' : '暂无可用结果'}</span>
            </div>
          )}
        </div>
        <div className="pointer-events-none w-full shrink-0 px-1 pb-1 pt-3 text-center">
          <p className="truncate text-[13px] font-semibold leading-tight text-slate-800 group-hover:text-indigo-600" title={title}>{title}</p>
          <p className="mt-1 truncate text-[11px] leading-tight text-slate-500" title={`${status} · ${model}`}>{status} · {model}</p>
        </div>
      </div>
    );
  }

  const emptyIcon = mediaCategory === 'canvas' ? <Layers className="h-8 w-8" /> : mediaCategory === 'video' ? <Film className="h-8 w-8" /> : mediaCategory === 'audio' ? <Music className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />;
  const emptyTitle = isFiltered ? '没有匹配的资产' : mediaCategory === 'canvas' ? '暂无画布资产' : mediaCategory === 'video' ? '暂无视频资产' : mediaCategory === 'audio' ? '暂无音频资产' : '暂无生成历史资产';
  const isSearching = Boolean(isPreparing || isLoadingTasks || isSearchingHistory || (isFiltered && isLoadingMoreTasks));

  return (
    <div className="space-y-8 animate-fade-in">
      {tasksHasMore && isFiltered && !loadError && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><span>{isSearching || isLoadingMoreTasks ? '正在查找更早的资产…' : '当前结果来自已加载记录，还有更早的历史可查找'}</span><button type="button" onClick={onLoadMore} disabled={isBusy || isSearching || isLoadingMoreTasks} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-indigo-600 disabled:opacity-50">继续查找</button></div>}
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><span>{loadError}</span><button type="button" onClick={onRetryLoad} disabled={isBusy || isLoadingTasks || isLoadingMoreTasks} className="cursor-pointer rounded-lg bg-white px-3 py-1.5 font-semibold hover:bg-amber-100">重新加载</button></div>}
      {mergedTasks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">{isSearching ? <Loader2 className="h-8 w-8 animate-spin text-indigo-500" /> : emptyIcon}</div>
          <div className="space-y-1"><p role="status" className="text-sm font-semibold text-slate-700">{isSearching ? '正在加载资产' : loadError ? '历史资产加载失败' : emptyTitle}</p><p className="text-xs text-slate-500">{isSearching ? '正在获取历史记录，请稍候' : loadError ? '请稍后重新加载历史记录' : isFiltered ? tasksHasMore ? '已加载的历史中暂无匹配，可继续查找更早的资产' : '试试其他关键词或调整时间范围' : '创作完成的媒体会自动在此归档'}</p></div>
          {!isSearching && tasksHasMore && !isFiltered && !loadError && <button type="button" onClick={onLoadMore} disabled={isBusy} className="rounded-xl bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-600">继续加载更早的资产</button>}
          {!isSearching && !isFiltered && !loadError && !tasksHasMore && <button type="button" onClick={() => setCurrentView(mediaCategory === 'canvas' ? 'canvas' : 'home')} className="mt-2 cursor-pointer rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-black">{mediaCategory === 'canvas' ? '前往无限画布创作' : '前往灵感大厅创作'}</button>}
        </div>
      ) : ([['今天', visibleToday], ['昨天', visibleYesterday], ['更早', visibleEarlier]] as const).map(([label, batches]) => batches.length > 0 && (
        <section key={label} className="space-y-4" aria-label={`${label}的资产`}><h2 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-xl">{label}</h2><div className={`${autoFillGrid} pt-1`}>{batches.map(renderBatchCard)}</div></section>
      ))}
      {tasksHasMore && !isFiltered && renderedBatches === totalBatches && !loadError && <div className="flex justify-center"><button type="button" onClick={onLoadMore} disabled={isBusy || isLoadingMoreTasks} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-600 disabled:opacity-50">{isLoadingMoreTasks ? '正在加载…' : '加载更早的历史资产'}</button></div>}
      {hasMore && !loadError && !(isFiltered && tasksHasMore && renderedBatches === totalBatches) && <div ref={loadMoreSentinelRef} className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">{isLoadingMoreTasks && <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}<span role="status">{isLoadingMoreTasks ? '正在加载更多历史资产' : `加载更多资产 · 已展示 ${renderedBatches} / ${totalBatches} 个套组`}</span></div>}
    </div>
  );
}
