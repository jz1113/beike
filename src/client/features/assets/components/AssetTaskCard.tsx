import { useState } from 'react';
import { AlertCircle, Check, Download, Loader2, RotateCw, Trash2 } from 'lucide-react';
import { formatDisplayModel, formatDisplayModelCompact } from '@shared/domain/media/drawing';
import AIGeneratingCard from '@client/shared/ui/AIGeneratingCard';
import { downloadMedia } from '@client/shared/media/downloadMedia';
import { getAssetDownloadExtension } from '@client/shared/utils/assetTaskData';
import { cardContainer } from '@client/shared/ui/layoutClasses';
import AssetMediaPreview from './AssetMediaPreview';
import { getAssetMediaKind, isAssetTaskRunning } from '../model/assetMedia';
import type { AssetTaskBatch } from '../model/assetBatch';

type Task = AssetTaskBatch['tasks'][number];
interface Props {
  task: Task;
  mergedTasks: Task[];
  isBatchMode: boolean;
  isBusy?: boolean;
  selectedTaskIds: string[];
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  setPreviewTask: (task: Task, queue?: Task[]) => void;
  onDeleteTask: (task: Task, event?: React.MouseEvent) => void;
  onRegenerate: (task: Task, event: React.MouseEvent) => void;
  showToast?: (message: string) => void;
}

export default function AssetTaskCard({ task, mergedTasks, isBatchMode, isBusy, selectedTaskIds, setSelectedTaskIds, setPreviewTask, onDeleteTask, onRegenerate, showToast }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const isSelected = selectedTaskIds.includes(task.id);
  const isSuccess = Boolean(task.resultUrl) && task.status !== 'FAILURE';
  const isRunning = isAssetTaskRunning(task);
  const kind = getAssetMediaKind(task);
  const isVideo = kind === 'video';
  const model = formatDisplayModelCompact(task.model, isVideo);
  const title = task.title || task.prompt || (isVideo ? '生成视频' : kind === 'audio' ? '生成音频' : '生成图片');
  const interactive = isBatchMode || (isSuccess && (kind === 'image' || kind === 'video'));

  const downloadTask = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isBusy || isDownloading || !isSuccess) return;
    setIsDownloading(true);
    try {
      await downloadMedia(task.resultUrl, `beike_${kind}_${Date.now()}.${getAssetDownloadExtension(task.mediaType, task.resultUrl)}`);
      showToast?.('已发起浏览器下载');
    } catch (error) {
      showToast?.(error instanceof Error ? `下载失败：${error.message}` : '素材下载失败，请重试');
    } finally {
      setIsDownloading(false);
    }
  };

  const openTask = () => {
    if (isBusy) return;
    if (isBatchMode) {
      setSelectedTaskIds(prev => isSelected ? prev.filter(id => id !== task.id) : Array.from(new Set([...prev, task.id])));
      return;
    }
    if (!interactive) return;
    const raw = task.rawTask || {};
    const referenceImages = task.referenceImages || raw.referenceImages || task.images || raw.images;
    const referenceImageUrl = task.referenceImageUrl || raw.referenceImageUrl || task.sourceImageUrl || raw.sourceImageUrl;
    const createdAt = new Date(task.createdAt).getTime();
    const payload = {
      ...task,
      title,
      mediaType: task.mediaType || kind,
      status: 'SUCCESS',
      batchId: task.batchId || raw.batchId,
      sessionId: task.sessionId || raw.sessionId,
      referenceImages,
      referenceImageUrl,
      images: task.images || referenceImages,
      sourceImageUrl: task.sourceImageUrl || referenceImageUrl,
      useReferenceImage: Boolean(referenceImages?.length || referenceImageUrl || task.useReferenceImage),
      rawTask: task.rawTask || task,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    };
    const siblings = mergedTasks.filter(t => t.resultUrl && t.status !== 'FAILURE' && getAssetMediaKind(t) === kind && (
      (task.batchId && t.batchId === task.batchId) || (task.sessionId && t.sessionId === task.sessionId)
    ));
    setPreviewTask(payload, siblings.length > 1 ? siblings : [payload]);
  };

  const errorTitle = task.status === 'FAILURE'
    ? `${isVideo ? '视频' : kind === 'audio' ? '音频' : '图片'}生成失败`
    : task.status === 'SUCCESS' ? '生成结果缺失' : task.status === 'EMPTY' ? '尚未添加媒体' : '任务未完成';

  return (
    <div
      className={`${cardContainer} group relative aspect-square min-w-0 overflow-hidden rounded-2xl border bg-slate-100 shadow-2xs transition-all focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 ${interactive ? 'cursor-pointer hover:shadow-md' : ''} ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-600' : 'border-slate-200/80'}`}
    >
      {interactive && <button type="button" onClick={openTask} disabled={isBusy} aria-label={`${isBatchMode ? '选择' : '预览'}：${title}`} aria-pressed={isBatchMode ? isSelected : undefined} className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-indigo-500 disabled:cursor-wait" />}
      <div className="absolute inset-0">
        {isSuccess ? <AssetMediaPreview src={task.resultUrl} mediaType={task.mediaType} model={task.model} title={title} posterUrl={task.coverUrl} audioControls={!isBatchMode} /> : isRunning ? (
          <div className="relative h-full w-full">
            <AIGeneratingCard task={task} showProgressBadge={Boolean(task.progress)} badgePosition={isBatchMode ? 'right' : 'left'} />
            <div role="status" className="absolute inset-x-2 bottom-4 text-center text-xs font-medium text-sky-800">{task.status === 'PENDING' || task.status === 'IDLE' ? '等待生成' : '正在生成'}</div>
          </div>
        ) : (
          <div role="status" className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 pb-10 text-center">
            <AlertCircle className="h-6 w-6 shrink-0 text-rose-500" />
            <span className="text-xs font-semibold text-slate-700">{errorTitle}</span>
            <span className="line-clamp-3 w-full break-words text-[11px] text-slate-500" title={task.failReason}>{task.failReason || '暂无可用结果，可重试或清理此记录'}</span>
          </div>
        )}
      </div>
      {isBatchMode && <div aria-hidden="true" className={`pointer-events-none absolute left-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-md shadow-xs ${isSelected ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white/90'}`}>{isSelected && <Check className="h-3 w-3" />}</div>}
      {isSuccess && kind !== 'audio' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-6 text-white">
          <p className="truncate text-[11px] font-medium" title={title}>{title}</p>
          <p className="mt-0.5 truncate text-[10px] text-white/80" title={formatDisplayModel(task.model, isVideo)}>{model}</p>
        </div>
      )}
      {!isBatchMode && (
        <div className={`absolute right-2 top-2 z-20 flex gap-1 ${isSuccess || isRunning ? 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100' : ''}`}>
          {isSuccess && (kind === 'audio' || kind === 'document') && <button type="button" disabled={isBusy || isDownloading} onClick={e => { void downloadTask(e); }} aria-label={`下载：${title}`} title="下载素材" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-white/90 text-slate-600 shadow-xs hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50">{isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}</button>}
          <button type="button" disabled={isBusy} onClick={e => { e.stopPropagation(); onDeleteTask(task, e); }} aria-label={`删除：${title}`} title="删除记录" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-white/90 text-slate-600 shadow-xs hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-indigo-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {!isSuccess && !isRunning && !isBatchMode && task.prompt && (kind === 'image' || kind === 'video') && (
        <button type="button" disabled={isBusy} onClick={e => { e.stopPropagation(); onRegenerate(task, e); }} className="absolute inset-x-3 bottom-3 flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><RotateCw className="h-3 w-3" />再次创作</button>
      )}
    </div>
  );
}
