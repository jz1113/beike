import { useState } from 'react';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import {
  Loader2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Download,
  ZoomIn,
  ExternalLink,
  LayoutGrid,
} from 'lucide-react';
import { BatchProductItem } from '../batchTypes';

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
  const successTasks = tasks.filter(t => t.status === 'SUCCESS' && t.resultUrl);
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
      <div className="space-y-4 bg-white rounded-2xl border border-slate-200/80 p-5 min-w-0">
        {/* 标题顶栏 */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <span className="w-1.5 h-3 bg-red-600 rounded-full" />
            <span>商品信息</span>
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-200/60 font-mono">
            {item.platform?.toUpperCase() || '商品'}
          </span>
        </div>

        {/* 商品名称 */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-400 block">商品名称</label>
          <div className="text-xs font-bold text-slate-900 leading-snug break-words">
            {item.title}
          </div>
        </div>

        {/* 商品链接（京东直接跳转形式） */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-400">商品链接</label>
            {cleanId && (
              <span className="text-[10px] text-slate-400 font-mono">ID: {cleanId}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href={jdUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer group"
              title="在新标签页中直接打开京东商品页"
            >
              <span className="truncate">打开京东商品页</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>

            <button
              type="button"
              onClick={() => handleCopy(`jd_${item.id}`, jdUrl)}
              className="py-2 px-3 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              title="复制该商品的京东直达链接"
            >
              {copiedId === `jd_${item.id}` ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 商品原图 */}
        <div className="space-y-1.5 pt-1">
          <label className="text-[11px] font-bold text-slate-400 block">商品原图</label>
          <div className="relative aspect-[4/3] rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden group shadow-sm">
            {coverUrl ? (
              <>
                <LazyProxyImage
                  src={coverUrl}
                  alt="商品原图"
                  className="w-full h-full !object-contain"
                  thumb={true}
                  width={600}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (onPreviewGallery) {
                      onPreviewGallery([coverUrl], 0, `${item.title} - 商品原图`);
                    } else {
                      setPreviewImageUrl(coverUrl);
                    }
                  }}
                  className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center shadow-md cursor-pointer transition-all active:scale-95"
                  title="放大查看原图"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="text-center p-4 text-slate-400 text-xs flex items-center justify-center h-full">
                暂无商品原图
              </div>
            )}
          </div>
        </div>

      </div>

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

            {retryFailedImageTasks && tasks.some(t => t.status === 'FAILURE') && (
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
                      } else if (isGenFailure && retrySingleShotTask) {
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
                                  `${item.itemId || item.id}_分镜${task.shot_no}.jpg`
                                );
                              }}
                              className="w-10 h-10 rounded-full bg-white/95 text-slate-800 flex items-center justify-center shadow-lg hover:bg-white transition-all active:scale-95 cursor-pointer"
                              title="下载原图"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </>
                    ) : isGenFailure ? (
                      <div className="p-4 text-center space-y-2">
                        <XCircle className="w-8 h-8 text-rose-500 mx-auto" />
                        <div className="text-xs font-bold text-rose-700">生成失败</div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            retrySingleShotTask?.(item.id, shotIdx);
                          }}
                          className="px-3 py-1 bg-white border border-rose-200 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer shadow-sm"
                        >
                          重试
                        </button>
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

                  <div className="text-center">
                    <span className="text-[11px] font-bold text-slate-700 truncate block">
                      {task.title || `分镜 ${task.shot_no}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===================== 右侧栏 (4/12 宽度)：文案交付工作台 ===================== */}
      <div className="lg:col-start-2 min-w-0 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 space-y-3">
        {/* 小红书种草文案交付工作台 */}
        {/* 单品快捷动作条 */}
        <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
          <button
            type="button"
            onClick={() => generateCopywritingForProduct(item)}
            disabled={item.isCopywritingGenerating}
            className="flex-1 py-2 px-2 rounded-xl text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
            title="重新为当前款生成小红书种草文案"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${item.isCopywritingGenerating ? 'animate-spin' : ''}`} />
            <span>{item.isCopywritingGenerating ? '生成中...' : '重写文案'}</span>
          </button>

          {handleExportSingleProductZip && (
            <button
              type="button"
              onClick={() => handleExportSingleProductZip(item)}
              disabled={isExportingZip || successTasks.length === 0}
              className="flex-1 py-2 px-2 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
              title="打包下载当前款所有图片与文案"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>导出本款</span>
            </button>
          )}
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-3 bg-amber-500 rounded-full" />
              <h3 className="text-sm font-semibold text-slate-800">文案交付</h3>
            </div>

            <button
              type="button"
              onClick={() => handleCopyAllCopywriting(item)}
              disabled={!titleText && !contentText && !(cw.tags || []).length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copiedId === `all_${item.id}` ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span className="font-bold">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>一键复制</span>
                </>
              )}
            </button>
          </div>

          {/* 笔记标题 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-bold">标题</span>
              </label>
              <span className={`text-[11px] font-mono ${titleLength > 20 ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                {titleLength}/20 字
              </span>
            </div>
            <input
              aria-label="文案标题"
              type="text"
              value={titleText}
              onChange={(e) => {
                updateItemCopywriting?.(item.id, {
                  title: e.target.value,
                  content: contentText,
                  tags: cw.tags,
                });
              }}
              placeholder="输入 5-20 字无表情包的小红书标题..."
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-colors"
            />
          </div>

          {/* 笔记正文 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-bold">正文</span>
              </label>
              <span className={`text-[11px] font-mono ${contentLength < 100 ? 'text-amber-500 font-bold' : 'text-slate-400'}`}>
                {contentLength} 字 · 建议至少 100 字
              </span>
            </div>
            <textarea
              aria-label="文案正文"
              value={contentText}
              onChange={(e) => {
                updateItemCopywriting?.(item.id, {
                  title: titleText,
                  content: e.target.value,
                  tags: cw.tags,
                });
              }}
              rows={8}
              placeholder="输入大于 100 字的真实自用口吻正文..."
              className="w-full min-h-56 bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-800 leading-7 font-normal focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-colors resize-y"
            />
          </div>

          {/* 热门标签 */}
          {(cw.tags || []).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-[11px] text-slate-400 font-medium">热门标签:</span>
              {cw.tags?.map((t, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80"
                >
                  #{t.replace(/^#/, '')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
