import type { OutputRating } from '@shared/contracts/categorySkills';
import { useState } from 'react';
import '../delivery/workshopDelivery.css';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import {
  Clock3,
  Loader2,
  XCircle,
  Download,
  ZoomIn,
  LayoutGrid,
} from 'lucide-react';
import { BatchProductItem } from '../../model/batchTypes';
import { isDeliverableWorkshopResult, isUsableWorkshopResult } from '../../model/generation/workshopReadiness';
import { BatchStage4ProductInfo } from './BatchStage4ProductInfo';
import { BatchStage4CopyPanel } from './BatchStage4CopyPanel';
import { WorkshopPromoteGroup } from '../delivery/WorkshopPromoteGroup';
import { workshopProductSource } from '../../model/collection/productSource';

export interface BatchStage4ProductItemProps {
  productNavigation?: React.ReactNode;
  item: BatchProductItem;
  selectedVisionModel: string;
  generateCopywritingForProduct: (item: BatchProductItem) => Promise<void>;
  updateItemCopywriting?: (itemId: string, copywriting: { title: string; content: string; tags?: string[] }) => void;
  retrySingleShotTask?: (itemId: string, shotIndex: number) => Promise<void>;
  isExportingZip: boolean;
  handleExportSingleProductZip?: (item: BatchProductItem) => Promise<void>;
  handleDownloadSingleTaskImage?: (url: string, filename?: string) => Promise<void>;
  setPreviewImageUrl: (url: string | null) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  onRecheckTask?: (itemId: string, taskId: string) => Promise<void>;
  readOnly?: boolean;
  isReviewingOutputs?: boolean;
  onReviewTask?: (itemId: string, taskId: string, decision: 'accepted' | 'retry_requested' | 'rejected', rating?: OutputRating) => void;
}

export function BatchStage4ProductItem({
  productNavigation,
  item,
  selectedVisionModel,
  generateCopywritingForProduct,
  updateItemCopywriting,
  retrySingleShotTask,
  handleDownloadSingleTaskImage,
  setPreviewImageUrl,
  onPreviewGallery,
  onRecheckTask,
  readOnly = false,
  isReviewingOutputs = false,
  onReviewTask,
}: BatchStage4ProductItemProps) {
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAllCopywriting = (prod: BatchProductItem) => {
    const title = prod.copywriting?.title || '';
    const content = prod.copywriting?.content || '';
    const tags = (prod.copywriting?.tags || []).map(t => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    const fullText = `${title}\n\n${content}${tags ? `\n\n${tags}` : ''}`;
    handleCopy(`all_${prod.id}`, fullText);
  };

  const tasks = item.tasks || [];
  const successTasks = tasks.filter(isUsableWorkshopResult);
  const selectedImages = [...new Set((item.selectedProductImages || []).filter(Boolean))];
  const cw = item.copywriting || { title: '', content: '', tags: [] };
  const titleText = cw.title || '';
  const contentText = cw.content || '';
  const titleLength = titleText.replace(/\s+/g, '').length;
  const contentLength = contentText.length;

  const previewUrls = successTasks
    .map(t => t.resultUrl)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);

  const productUrl = workshopProductSource(item);

  return (
    <div key={item.id} className="grid grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)] gap-4 items-start animate-in fade-in duration-200">
      {/* ===================== 左侧栏 (3/12 宽度)：商品信息 ===================== */}
      <div className="lg:row-span-2 min-w-0 space-y-4">
      <BatchStage4ProductInfo
        item={item}
        productUrl={productUrl}
        copiedId={copiedId}
        onCopy={handleCopy}
        onPreview={(url) => {
          if (onPreviewGallery) onPreviewGallery(selectedImages, Math.max(0, selectedImages.indexOf(url)), `${item.title} - 已选商品图`);
          else setPreviewImageUrl(url);
        }}
      />

      {/* ===================== 中间栏 (5/12 宽度)：成图展台 ===================== */}
      {productNavigation}
      </div>
      <div className="workshop-image-gallery lg:col-start-2 min-w-0 rounded-2xl border border-slate-200/80 bg-white/95 p-4 sm:p-5 space-y-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#18191c]/95">
        <WorkshopPromoteGroup item={item} visionModel={selectedVisionModel} />
        {/* 切片成图展台 (4 张大图) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                生成图片 <span className="ml-2 text-xs font-normal tabular-nums text-slate-500 dark:text-slate-400">{successTasks.length}/{tasks.length} 已完成</span>
              </h3>
              {!readOnly && onReviewTask && <span className="text-[11px] text-slate-400 dark:text-slate-500">点击图片切换采用状态，灰色为不采用</span>}
            </div>

            {/* 预览全部按钮 */}
            {previewUrls.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (onPreviewGallery) {
                    onPreviewGallery(previewUrls, 0, `${item.title} - 全部成图`);
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer dark:text-slate-300 dark:hover:bg-white/10"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>预览全部</span>
              </button>
            )}

          </div>

          {/* 4 栏等高大图网格 */}
          {tasks.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center dark:bg-[#131417] dark:border-white/10">
              <LayoutGrid className="w-6 h-6 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">暂无生成图片</p>
              <p className="text-xs text-slate-400 mt-1">生成任务创建后，将在这里展示进度与成图。</p>
            </div>
          )}
          <div className="workshop-image-grid" data-count={tasks.length}>
            {tasks.map((task, shotIdx) => {
              const hasImage = isUsableWorkshopResult(task);
              const excluded = hasImage && !isDeliverableWorkshopResult(task);
              const isGenFailure = task.status === 'FAILURE' || (task.status === 'SUCCESS' && !hasImage);
              const canRecover = Boolean(task.upstreamTaskId || task.idempotencyKey || task.gridTaskKey || task.gridSourceUrl || item.masterGridUrl);
              const currentPreviewIdx = hasImage && task.resultUrl ? previewUrls.indexOf(task.resultUrl) : 0;

              return (
                <div key={task.id || shotIdx} className="min-w-0 space-y-2 flex flex-col">
                  <div
                    onClick={() => {
                      if (!hasImage && !readOnly && isGenFailure && retrySingleShotTask && !recheckingId && !canRecover) {
                        retrySingleShotTask(item.id, shotIdx);
                      }
                    }}
                    className={`aspect-[3/4] rounded-xl border overflow-hidden relative flex items-center justify-center transition-colors group ${hasImage || (!readOnly && isGenFailure) ? 'cursor-pointer' : 'cursor-default'} ${
                      hasImage
                        ? 'border-slate-200 hover:border-indigo-400 bg-slate-50 dark:bg-[#131417] dark:border-white/10 dark:hover:border-indigo-400/60'
                        : task.recoveryRequired
                        ? 'border-amber-300 bg-amber-50/70 hover:bg-amber-100/60 dark:border-amber-500/30 dark:bg-amber-950/30 dark:hover:bg-amber-950/45'
                        : isGenFailure
                        ? 'border-rose-300 bg-rose-50/70 hover:bg-rose-100/60 dark:border-rose-500/30 dark:bg-rose-950/30 dark:hover:bg-rose-950/45'
                        : 'border-slate-200/80 bg-slate-50/90 dark:border-white/10 dark:bg-[#131417]'
                    }`}
                  >
                    {hasImage && task.resultUrl ? (
                      <>
                        <div className={`h-full w-full transition-[filter,opacity] ${excluded ? 'grayscale opacity-35' : ''}`}>
                        <LazyProxyImage
                          src={task.resultUrl}
                          alt={task.title}
                          className="w-full h-full !object-contain"
                          thumb={true}
                          width={800}
                        />
                        </div>
                        <button
                          type="button"
                          aria-label={`分镜 ${task.shot_no}：${!readOnly && onReviewTask ? excluded ? '点击恢复采用' : '点击不采用' : '放大预览'}`}
                          aria-pressed={!readOnly && onReviewTask ? excluded : undefined}
                          disabled={!readOnly && !!onReviewTask && isReviewingOutputs}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!readOnly && onReviewTask) onReviewTask(item.id, task.id, excluded ? 'accepted' : 'rejected');
                            else if (onPreviewGallery) onPreviewGallery(previewUrls, Math.max(0, currentPreviewIdx), `${item.title} - 分镜 ${task.shot_no}`);
                            else setPreviewImageUrl(task.resultUrl!);
                          }}
                          className="absolute inset-0 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-indigo-500 disabled:cursor-wait"
                        />
                        {/* Preview remains separate from the image review toggle. */}
                        <div className="absolute right-2 top-2 z-10 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onPreviewGallery && previewUrls.length > 0) {
                                onPreviewGallery(previewUrls, Math.max(0, currentPreviewIdx), `${item.title} - 分镜 ${task.shot_no}`);
                              } else {
                                setPreviewImageUrl(task.resultUrl!);
                              }
                            }}
                            className="w-10 h-10 rounded-full bg-white/95 text-slate-800 flex items-center justify-center shadow-lg hover:bg-white transition-all active:scale-95 cursor-pointer dark:text-slate-100 dark:hover:bg-white/10 dark:bg-[#18191c]/95"
                            title="放大全屏预览"
                          >
                            <ZoomIn className="w-5 h-5" />
                          </button>
                          {handleDownloadSingleTaskImage && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadSingleTaskImage(
                                  task.resultUrl!,
                                  `${item.itemId || item.id}_分镜${task.shot_no}`
                                );
                              }}
                              className="w-10 h-10 rounded-full bg-white/95 text-slate-800 flex items-center justify-center shadow-lg hover:bg-white transition-all active:scale-95 cursor-pointer dark:text-slate-100 dark:hover:bg-white/10 dark:bg-[#18191c]/95"
                              title="下载原图"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                        {task.resultStatus === 'superseded' ? (
                          <span className="absolute left-2 top-2 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">需重做</span>
                        ) : null}
                        {task.temporaryUrl ? (
                          <span className="absolute bottom-2 left-2 right-2 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">临时链接，建议尽快下载</span>
                        ) : null}
                      </>
                    ) : isGenFailure ? (
                      <div className="p-4 text-center space-y-2">
                        <span className="flex justify-center">{task.recoveryRequired ? <Clock3 className="w-8 h-8 text-amber-600 dark:text-amber-400" /> : <XCircle className="w-8 h-8 text-rose-500 dark:text-rose-400" />}</span>
                        <div className={`text-xs font-bold ${task.recoveryRequired ? 'text-amber-800 dark:text-amber-200' : 'text-rose-700 dark:text-rose-300'}`}>{task.status === 'SUCCESS' ? '图片需重新生成' : task.recoveryRequired ? '结果待核对' : '生成失败'}</div>
                        {task.error && <details className="text-left text-[11px] leading-5 text-rose-600 dark:text-rose-300 select-text">
                          <summary className="cursor-pointer text-center">查看详细原因</summary>
                          <p className="mt-1 max-h-32 overflow-y-auto break-words">{task.error}</p>
                        </details>}
                        {task.recoveryRequired && <p className="text-[11px] leading-5 text-amber-800 dark:text-amber-200">请先核对原任务。重新生成可能重复计费。</p>}
                        {task.upstreamTaskId && <p className="break-all text-[10px] text-slate-400 select-text">任务 ID：{task.upstreamTaskId}</p>}
                        {!readOnly && canRecover && onRecheckTask && <button type="button" disabled={recheckingId !== null}
                          onClick={async (event) => { event.stopPropagation(); setRecheckingId(task.id); try { await onRecheckTask(item.id, task.id); } finally { setRecheckingId(null); } }}
                          className="rounded-lg border border-indigo-200 bg-white px-3 py-1 text-[11px] font-semibold text-indigo-600 disabled:opacity-40 dark:border-indigo-500/30 dark:bg-[#18191c] dark:text-indigo-300">{recheckingId === task.id ? '核对中…' : '核对原任务'}</button>}
                        {!readOnly && retrySingleShotTask && <button
                          type="button"
                          disabled={recheckingId !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            retrySingleShotTask?.(item.id, shotIdx);
                          }}
                          className="px-3 py-1 bg-white border border-rose-200 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer shadow-sm dark:bg-[#18191c] dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-950/40"
                        >
                          {task.recoveryRequired ? '放弃恢复并重做' : '重新生成'}
                        </button>}
                      </div>
                    ) : task.status === 'PENDING' ? (
                      <div role="status" className="p-4 text-center space-y-2">
                        <Clock3 className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-500" />
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">排队中</div>
                      </div>
                    ) : (
                      <div role="status" aria-label={`分镜 ${task.shot_no} 生成中`} className="flex flex-col items-center gap-3 p-4 text-center">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
                        </span>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">正在生成</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">完成后自动显示</span>
                      </div>
                    )}

                    {/* 角标：分镜编号 */}
                    <div className="absolute top-2.5 left-2.5 flex h-6 min-w-6 items-center justify-center rounded-md border border-slate-200/80 bg-white/90 px-1 text-[11px] font-medium tabular-nums text-slate-600 pointer-events-none dark:text-slate-300 dark:border-white/10 dark:bg-[#18191c]/95">
                      {task.shot_no}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      </div>

      <BatchStage4CopyPanel
        item={item}
        copiedId={copiedId}
        titleText={titleText}
        contentText={contentText}
        titleLength={titleLength}
        contentLength={contentLength}
        tags={cw.tags || []}
        successCount={tasks.filter(isDeliverableWorkshopResult).length}
        generateCopywritingForProduct={generateCopywritingForProduct}
        updateItemCopywriting={updateItemCopywriting}
        onCopyAll={handleCopyAllCopywriting}
        readOnly={readOnly}
      />
    </div>
  );
}
