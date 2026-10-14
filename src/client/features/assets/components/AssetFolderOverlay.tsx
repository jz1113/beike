import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { Download, Eye, Layers, LayoutGrid, Loader2, Sparkles, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { downloadMedia } from '@client/shared/media/downloadMedia';
import AIGeneratingCard from '@client/shared/ui/AIGeneratingCard';
import DepthCarousel from '@client/shared/media/DepthCarousel';
import { videoPlaybackManager } from '@client/shared/media/videoPlaybackManager';
import { exportZipDownload, formatExportProgress } from '@client/shared/api/exportZipDownload';
import type { GenerationTask } from '@client/store/appStoreTypes';
import type { AssetTaskBatch } from '../model/assetBatch';
import { getAssetMediaKind, isAssetTaskRunning } from '../model/assetMedia';
import AssetMediaPreview from './AssetMediaPreview';

interface Props {
  folderBatch: AssetTaskBatch;
  isDownloadingZip?: boolean;
  setIsDownloadingZip?: (v: boolean) => void;
  showToast?: (msg: string) => void;
  setQuickPrompt?: (prompt: string) => void;
  setPreviewTask: (task: GenerationTask, queue?: GenerationTask[]) => void;
  onClose: () => void;
  onEnterCanvas?: (projectId: string) => void;
}

type FolderTask = GenerationTask & { aspectRatio?: string; isCanvasPlaceholder?: boolean; coverUrl?: string };

function parseRatio(size?: string): number {
  const match = size?.trim().match(/^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) return 3 / 4;
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 3 / 4;
}

function downloadExtension(task: FolderTask): string {
  const url = task.resultUrl || '';
  const extension = url.match(/\.(png|jpe?g|webp|gif|avif|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|aac|flac|pdf|docx?|txt)(?:[?#]|$)/i)?.[1];
  if (extension) return extension.toLowerCase();
  const mime = url.match(/^data:([^;,]+)/)?.[1];
  const mimeExtensions: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
    'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/aac': 'aac', 'audio/mp4': 'm4a',
    'video/webm': 'webm', 'video/quicktime': 'mov', 'application/pdf': 'pdf',
  };
  if (mime && mimeExtensions[mime]) return mimeExtensions[mime];
  const kind = getAssetMediaKind(task);
  return kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : kind === 'document' ? 'txt' : 'png';
}

export default function AssetFolderOverlay({ folderBatch, isDownloadingZip = false, setIsDownloadingZip, showToast = () => {}, setPreviewTask, onClose, onEnterCanvas }: Props) {
  const [viewMode, setViewMode] = useState<'3d' | 'grid'>('grid');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [zipBusy, setZipBusy] = useState(false);
  const zipLock = useRef(false);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [imageRatio, setImageRatio] = useState<{ url: string; ratio: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const restoreFocusRef = useRef(true);
  const titleId = useId();
  onCloseRef.current = onClose;

  const tasks = folderBatch.tasks as FolderTask[];
  const validTasks = useMemo(() => tasks.filter(task => task.resultUrl && task.status !== 'FAILURE'), [tasks]);
  const previewTasks = useMemo(() => validTasks.filter(task => ['image', 'video'].includes(getAssetMediaKind(task))), [validTasks]);
  const firstImage = validTasks.find(task => getAssetMediaKind(task) === 'image');
  const allImages = tasks.length > 0 && validTasks.length === tasks.length && validTasks.every(task => getAssetMediaKind(task) === 'image');
  const canUseCarousel = allImages && viewport.width >= 480 && viewport.height >= 520;
  const useCarousel = viewMode === '3d' && canUseCarousel;
  useEffect(() => { setCarouselIndex(0); }, [useCarousel, folderBatch.batchId]);
  const isCanvasBatch = folderBatch.batchId.startsWith('canvas-project-');
  const canvasProjectId = isCanvasBatch ? folderBatch.batchId.slice('canvas-project-'.length) : null;
  const failedCount = tasks.filter(task => task.status === 'FAILURE' && !task.resultUrl).length;
  const runningCount = tasks.filter(isAssetTaskRunning).length;
  const ratio = imageRatio && imageRatio.url === firstImage?.resultUrl ? imageRatio.ratio : parseRatio(firstImage?.size || firstImage?.aspectRatio || folderBatch.size);
  const maxHeight = Math.min(520, Math.max(120, viewport.height - 230));
  const cardWidth = Math.round(Math.min(640, viewport.width - 180, maxHeight * ratio));
  const cardHeight = Math.round(cardWidth / ratio);
  const carouselItems = useMemo(() => validTasks.map((task, index) => ({
    image: proxyMediaUrl(task.resultUrl, { thumb: true, width: 640 }),
    rawUrl: proxyMediaUrl(task.resultUrl),
    alt: task.prompt || `第 ${index + 1} 张图片`,
    task,
  })), [validTasks]);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!useCarousel || !firstImage?.resultUrl) return;
    const url = firstImage.resultUrl;
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) setImageRatio({ url, ratio: image.naturalWidth / image.naturalHeight });
    };
    image.src = proxyMediaUrl(url, { thumb: true, width: 320 });
    return () => { image.onload = null; };
  }, [firstImage?.resultUrl, useCarousel]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const resumePreviews = videoPlaybackManager.suspend();
    document.querySelectorAll<HTMLAudioElement>('audio[data-asset-audio]').forEach(audio => audio.pause());
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], audio[controls], [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0);
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      resumePreviews();
      if (restoreFocusRef.current && previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const openPreview = (task: FolderTask) => {
    const kind = getAssetMediaKind(task);
    if (!task.resultUrl || task.status === 'FAILURE' || (kind !== 'image' && kind !== 'video')) return;
    restoreFocusRef.current = false;
    setPreviewTask({ ...task, mediaType: task.mediaType || kind, status: 'SUCCESS' }, previewTasks);
    onClose();
  };

  const handleDownload = async (task: FolderTask, index: number) => {
    if (!task.resultUrl || task.status === 'FAILURE' || downloadingIds.has(task.id)) return;
    setDownloadingIds(previous => new Set(previous).add(task.id));
    showToast('正在下载素材…');
    try {
      const kind = getAssetMediaKind(task);
      await downloadMedia(task.resultUrl, `beike_${kind}_${index + 1}_${Date.now()}.${downloadExtension(task)}`);
      showToast('已发起浏览器下载');
    } catch (error) {
      showToast(error instanceof Error ? `下载失败：${error.message}` : '素材下载失败，请稍后重试');
    } finally {
      setDownloadingIds(previous => {
        const next = new Set(previous);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleDownloadZip = async () => {
    if (zipLock.current || zipBusy || isDownloadingZip) return;
    const downloadable = tasks.filter(task => task.resultUrl && task.status !== 'FAILURE');
    if (!downloadable.length) return;
    zipLock.current = true;
    setZipBusy(true);
    setIsDownloadingZip?.(true);
    showToast(`正在打包 ${downloadable.length} 项素材…`);
    try {
      const images = downloadable.map((task, index) => ({
        url: task.resultUrl,
        filename: `${String(index + 1).padStart(3, '0')}_${getAssetMediaKind(task)}.${downloadExtension(task)}`,
        prompt: task.prompt,
      }));
      const result = await exportZipDownload({ images, productTitle: folderBatch.title || '资产套组', skuId: 'BEIKE_ASSETS' }, `beike_assets_${Date.now()}.zip`, progress => {
        if (progress.phase !== 'done') showToast(formatExportProgress(progress));
      });
      const delivery = 'ZIP 已发起浏览器下载';
      showToast(result.partial ? `${delivery}；${result.succeeded} 项成功、${result.failed} 项失败，包内附失败清单` : delivery);
    } catch (error) {
      showToast(error instanceof Error ? `打包下载失败：${error.message}` : '打包下载失败，请稍后重试');
    } finally {
      zipLock.current = false;
      setZipBusy(false);
      setIsDownloadingZip?.(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[calc(100dvh-24px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-48px)]" onClick={event => event.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="line-clamp-2 break-words text-sm font-semibold text-slate-900">{folderBatch.title || folderBatch.prompt || '资产套组'}</h2>
            <p className="mt-1 text-xs text-slate-500">{tasks.filter(task => !task.isCanvasPlaceholder).length} 项资产 · {validTasks.length} 项可用{runningCount > 0 ? ` · ${runningCount} 项生成中` : ''}{failedCount > 0 ? ` · ${failedCount} 项失败` : ''}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canUseCarousel && (
              <div className="flex rounded-lg bg-slate-100 p-1" aria-label="资产显示方式">
                <button type="button" aria-pressed={!useCarousel} aria-label="网格查看" onClick={() => setViewMode('grid')} className={`rounded-md p-1.5 ${!useCarousel ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}><LayoutGrid className="h-4 w-4" /></button>
                <button type="button" aria-pressed={useCarousel} aria-label="立体查看" onClick={() => setViewMode('3d')} className={`rounded-md p-1.5 ${useCarousel ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}><Layers className="h-4 w-4" /></button>
              </div>
            )}
            <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭资产套组" className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-500"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
          {useCarousel ? (
            <div className="mx-auto w-full pb-6" style={{ height: Math.max(320, cardHeight + 64), maxWidth: Math.min(780, cardWidth + 190) }}>
              <DepthCarousel key={folderBatch.batchId} items={carouselItems} cardWidth={cardWidth} cardHeight={cardHeight} radius={20} depth={170} spread={46} tilt={18} perspective={1400} visibleCards={3} onChange={setCarouselIndex} onItemClick={index => openPreview(validTasks[index])} />
            </div>
          ) : tasks.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">该套组暂无资产</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {tasks.map((task, index) => {
                const kind = getAssetMediaKind(task);
                const isAvailable = Boolean(task.resultUrl) && task.status !== 'FAILURE';
                const canPreview = isAvailable && (kind === 'image' || kind === 'video');
                const title = task.title || task.prompt || `第 ${index + 1} 项资产`;
                const media = isAvailable ? <AssetMediaPreview src={task.resultUrl!} mediaType={task.mediaType} model={task.model} objectFit="contain" width={480} title={title} audioControls={kind === 'audio'} videoAutoPlay={false} posterUrl={task.coverUrl} /> : task.status === 'FAILURE' ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center"><span className="text-sm font-medium text-red-600">生成失败</span><p className="line-clamp-3 text-xs text-slate-500" title={task.failReason}>{task.failReason || '任务处理异常'}</p></div>
                ) : isAssetTaskRunning(task) ? <AIGeneratingCard task={task} variant="lite" showProgressBadge={Boolean(task.progress)} /> : <div className="flex h-full items-center justify-center p-3 text-center text-xs text-slate-500">{task.isCanvasPlaceholder ? '空画布项目' : String(task.status) === 'EMPTY' ? '尚未添加媒体' : task.status === 'IDLE' ? '等待生成' : '素材暂无可用地址'}</div>;
                return (
                  <article key={`${task.id}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {canPreview ? <button type="button" aria-label={`预览第 ${index + 1} 项：${title}`} onClick={() => openPreview(task)} className="relative block aspect-square w-full bg-slate-100 transition-colors hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:-outline-offset-2">{media}<span className="absolute left-2 top-2 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-white">#{index + 1}</span></button> : <div className="relative aspect-square bg-slate-100">{media}<span className="absolute left-2 top-2 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] text-white">#{index + 1}</span></div>}
                    <div className="p-3">
                      <p className="line-clamp-2 break-words text-xs text-slate-700" title={title}>{title}</p>
                      {isAvailable && (
                        <div className="mt-2 flex items-center justify-between gap-1">
                          {canPreview ? <button type="button" onClick={() => openPreview(task)} className="flex items-center gap-1 rounded-md py-1 text-xs text-indigo-600 hover:text-indigo-800"><Eye className="h-3.5 w-3.5" />{kind === 'video' ? '播放视频' : '放大查看'}</button> : <span className="text-xs text-slate-400">{kind === 'audio' ? '音频' : '文档'}</span>}
                          <button type="button" disabled={downloadingIds.has(task.id)} onClick={() => { void handleDownload(task, index); }} aria-label={`下载第 ${index + 1} 项资产`} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50">{downloadingIds.has(task.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}下载</button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {(validTasks.length > 0 || (canvasProjectId && onEnterCanvas)) && (
          <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-slate-100 px-4 py-3">
            {canvasProjectId && onEnterCanvas && <button type="button" onClick={() => { restoreFocusRef.current = false; onEnterCanvas(canvasProjectId); }} className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700"><Sparkles className="h-3.5 w-3.5" />进入画布编辑</button>}
            {useCarousel && <button type="button" onClick={() => openPreview(validTasks[carouselIndex] || validTasks[0])} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"><Eye className="h-3.5 w-3.5" />大图逐张查看</button>}
            {validTasks.length > 0 && <button type="button" disabled={zipBusy || isDownloadingZip} onClick={() => { void handleDownloadZip(); }} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-wait disabled:opacity-50">{zipBusy || isDownloadingZip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{zipBusy || isDownloadingZip ? '正在打包…' : '下载套组 ZIP'}</button>}
          </footer>
        )}
      </div>
    </div>
  );
}
