import { useState } from 'react';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import {
  Loader2,
  XCircle,
  RefreshCw,
  Download,
  ZoomIn,
  LayoutGrid,
} from 'lucide-react';
import { BatchProductItem } from '../model/batchTypes';
import { isEphemeralResultUrl } from '../model/workspaceRecovery';
import { BatchStage4ProductInfo } from './BatchStage4ProductInfo';
import { BatchStage4CopyPanel } from './BatchStage4CopyPanel';
import { OutputReviewButtons } from './OutputReviewButtons';

export interface BatchStage4ProductItemProps {
  productNavigation?: React.ReactNode;
  item: BatchProductItem;
  generateCopywritingForProduct: (item: BatchProductItem) => Promise<void>;
  updateItemCopywriting?: (itemId: string, copywriting: { title: string; content: string; tags?: string[] }) => void;
  retryFailedImageTasks?: () => Promise<void>;
  retrySingleShotTask?: (itemId: string, shotIndex: number) => Promise<void>;
  isExportingZip: boolean;
  handleExportSingleProductZip?: (item: BatchProductItem) => Promise<void>;
  handleDownloadSingleTaskImage?: (url: string, filename?: string) => Promise<void>;
  setPreviewImageUrl: (url: string | null) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  readOnly?: boolean;
  onReviewTask?: (itemId: string, taskId: string, decision: 'accepted' | 'retry_requested' | 'rejected') => void;
}

export function BatchStage4ProductItem({
  productNavigation,
  item,
  generateCopywritingForProduct,
  updateItemCopywriting,
  retryFailedImageTasks,
  retrySingleShotTask,
  isExportingZip,
  handleExportSingleProductZip,
  handleDownloadSingleTaskImage,
  setPreviewImageUrl,
  onPreviewGallery,
  readOnly = false,
  onReviewTask,
}: BatchStage4ProductItemProps) {
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

  const resolveJdUrl = (prod: BatchProductItem) => {
    const cleanId = String(prod.itemId || prod.id || '').replace(/[^\d]/g, '');
    if (cleanId) {
      return `https://item.jd.com/${cleanId}.html`;
    }
    if (prod.url && prod.url.startsWith('http')) {
      return prod.url;
    }
    return `https://search.jd.com/Search?keyword=${encodeURIComponent(prod.title)}`;
  };

  const tasks = item.tasks || [];
  const successTasks = tasks.filter(t => t.status === 'SUCCESS' && t.resultUrl && !isEphemeralResultUrl(t.resultUrl));
  const coverUrl = item.selectedProductImages?.[0] || item.coverImage;
  const cw = item.copywriting || { title: '', content: '', tags: [] };
  const titleText = cw.title || '';
  const contentText = cw.content || '';
  const titleLength = titleText.replace(/\s+/g, '').length;
  const contentLength = contentText.length;

  const previewUrls = successTasks
    .map(t => t.resultUrl)
    .filter((url): url is string => typeof url === 'string' && url.length > 0);

  const jdUrl = resolveJdUrl(item);
  const cleanId = String(item.itemId || item.id || '').replace(/[^\d]/g, '');

  return (
    <div key={item.id} className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start animate-in fade-in duration-200">
      {/* ===================== 左侧栏 (3/12 宽度)：商品信息 ===================== */}
      <div className="lg:row-span-2 min-w-0 space-y-4">
      <BatchStage4ProductInfo
        item={item}
        coverUrl={coverUrl}
        jdUrl={jdUrl}
        cleanId={cleanId}
        copiedId={copiedId}
        onCopy={handleCopy}
        onPreview={(url) => {
          if (onPreviewGallery) onPreviewGallery([url], 0, `${item.title} - 商品原图`);
          else setPreviewImageUrl(url);
        }}
      />

      {/* ===================== 中间栏 (5/12 宽度)：成图展台 ===================== */}
      {productNavigation}
      </div>
      <div className="lg:col-start-2 min-w-0 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 space-y-4">
        {/* 切片成图展台 (4 张大图) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-4 bg-indigo-600 rounded-full" />
              <h3 className="text-sm font-semibold text-slate-800">
                图片 ({successTasks.length}/{tasks.length} 已完成)
              </h3>
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600/90 hover:bg-indigo-600 text-white transition-colors cursor-pointer shadow-sm"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>预览全部</span>
              </button>
            )}

            {!readOnly && retryFailedImageTasks && tasks.some(t => t.status === 'FAILURE') && (
              <button
                type="button"
                onClick={() => void retryFailedImageTasks()}
                className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重试失败</span>
              </button>
            )}
          </div>

          {/* 4 栏等高大图网格 */}
          {tasks.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <LayoutGrid className="w-6 h-6 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600">暂无生成图片</p>
              <p className="text-xs text-slate-400 mt-1">生成任务创建后，将在这里展示进度与成图。</p>
            </div>
          )}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${tasks.length >= 4 ? 'lg:grid-cols-4' : tasks.length === 3 ? 'lg:grid-cols-3' : ''} gap-3`}>
            {tasks.map((task, shotIdx) => {
              const hasImage = task.status === 'SUCCESS' && !!task.resultUrl;
              const isGenFailure = task.status === 'FAILURE';
              const currentPreviewIdx = hasImage && task.resultUrl ? previewUrls.indexOf(task.resultUrl) : 0;

              return (
                <div key={task.id || shotIdx} className="space-y-2 flex flex-col">
                  <div
                    onClick={() => {
                      if (hasImage && task.resultUrl) {
                        if (onPreviewGallery && previewUrls.length > 0) {
                          onPreviewGallery(previewUrls, Math.max(0, currentPreviewIdx), `${item.title} - 分镜 ${task.shot_no}`);
                        } else {
                          setPreviewImageUrl(task.resultUrl);
                        }
                      } else if (!readOnly && isGenFailure && retrySingleShotTask) {
                        retrySingleShotTask(item.id, shotIdx);
                      }
                    }}
                    className={`aspect-[3/4] rounded-xl border overflow-hidden relative flex items-center justify-center cursor-pointer transition-colors group ${
                      hasImage
                        ? 'border-slate-200 hover:border-indigo-400 bg-slate-50'
                        : isGenFailure
                        ? 'border-rose-300 bg-rose-50/50 hover:bg-rose-100/50'
                        : 'border-slate-200 bg-slate-50/90'
                    }`}
                  >
                    {hasImage && task.resultUrl ? (
                      <>
                        <LazyProxyImage
                          src={task.resultUrl}
                          alt={task.title}
                          className="w-full h-full !object-contain"
                          thumb={true}
                          width={800}
                        />
                        {/* 悬浮工具层 */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
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
                            className="w-10 h-10 rounded-full bg-white/95 text-slate-800 flex items-center justify-center shadow-lg hover:bg-white transition-all active:scale-95 cursor-pointer"
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
                              className="w-10 h-10 rounded-full bg-white/95 text-slate-800 flex items-center justify-center shadow-lg hover:bg-white transition-all active:scale-95 cursor-pointer"
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
                        <XCircle className="w-8 h-8 text-rose-500 mx-auto" />
                        <div className="text-xs font-bold text-rose-700">生成失败</div>
                        {!readOnly && <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            retrySingleShotTask?.(item.id, shotIdx);
                          }}
                          className="px-3 py-1 bg-white border border-rose-200 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer shadow-sm"
                        >
                          重试
                        </button>}
                      </div>
                    ) : (
                      <div className="p-4 text-center space-y-2">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
                        <div className="text-xs font-bold text-slate-600">渲染中...</div>
                      </div>
                    )}

                    {/* 角标：分镜编号 */}
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-sm text-[10px] text-white font-mono font-bold pointer-events-none">
                      {task.shot_no}
                    </div>
                  </div>

                  <div className="text-center space-y-1">
                    <span className="text-[11px] font-bold text-slate-700 truncate block">
                      {task.title || `分镜 ${task.shot_no}`}
                    </span>
                    {!readOnly && hasImage && onReviewTask ? (
                      <OutputReviewButtons
                        decision={task.outputReview}
                        onDecide={(decision) => onReviewTask(item.id, task.id, decision)}
                      />
                    ) : null}
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
        successCount={successTasks.length}
        isExportingZip={isExportingZip}
        generateCopywritingForProduct={generateCopywritingForProduct}
        updateItemCopywriting={updateItemCopywriting}
        handleExportSingleProductZip={handleExportSingleProductZip}
        onCopyAll={handleCopyAllCopywriting}
        readOnly={readOnly}
      />
    </div>
  );
}
