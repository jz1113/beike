import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import LazyProxyImage from '@/shared/ui/LazyProxyImage';
import { BatchProductItem } from '../batchTypes';
import { BatchStage4Header } from './BatchStage4Header';
import { BatchStage4ProductItem } from './BatchStage4ProductItem';
import { BatchStage4GalleryView } from './BatchStage4GalleryView';

interface Props {
  successfulItems: BatchProductItem[];
  availableImageModels: any[];
  selectedImageGenModel: string;
  setSelectedImageGenModel: (m: string) => void;
  selectedQuality: 'high' | 'medium' | 'low';
  setSelectedQuality: (q: 'high' | 'medium' | 'low') => void;
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  setSelectedAspect: (a: '3:4' | '1:1' | '9:16' | '16:9') => void;
  isGeneratingBatch: boolean;
  totalTaskCount: number;
  completedTaskCount: number;
  successTaskCount: number;
  failTaskCount: number;
  hasHumanPersona: boolean;
  generateCopywritingForProduct: (item: BatchProductItem) => Promise<void>;
  updateItemCopywriting?: (itemId: string, copywriting: { title: string; content: string; tags?: string[] }) => void;
  generateAllCopywriting?: () => Promise<void>;
  retryFailedImageTasks?: () => Promise<void>;
  retrySingleShotTask?: (itemId: string, shotIndex: number) => Promise<void>;
  isExportingZip: boolean;
  exportingSingleItemId?: string | null;
  handleExportZip: () => Promise<void>;
  handleExportSingleProductZip?: (item: BatchProductItem) => Promise<void>;
  handleDownloadSingleTaskImage?: (url: string, filename?: string) => Promise<void>;
  setPreviewImageUrl: (url: string | null) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
}

export default function BatchStage4Queue({
  successfulItems,
  availableImageModels,
  selectedImageGenModel,
  setSelectedImageGenModel,
  selectedQuality,
  setSelectedQuality,
  selectedAspect,
  setSelectedAspect,
  isGeneratingBatch,
  totalTaskCount,
  completedTaskCount,
  successTaskCount,
  failTaskCount,
  generateCopywritingForProduct,
  updateItemCopywriting,
  generateAllCopywriting,
  retryFailedImageTasks,
  retrySingleShotTask,
  isExportingZip,
  handleExportZip,
  handleExportSingleProductZip,
  handleDownloadSingleTaskImage,
  setPreviewImageUrl,
  onPreviewGallery,
}: Props) {
  const [showEngineSettings, setShowEngineSettings] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'grid' | 'gallery'>('single');

  // 确保 activeItemIndex 不越界
  const safeIndex = Math.min(Math.max(0, activeItemIndex), Math.max(0, successfulItems.length - 1));
  const currentItem = successfulItems[safeIndex];

  const hasExportableSuccess = successfulItems.some(item =>
    (item.tasks || []).some(t => t.status === 'SUCCESS' && !!t.resultUrl),
  );

  const liveFailCount = successfulItems.reduce(
    (n, item) => n + (item.tasks || []).filter(t => t.status === 'FAILURE' && !t.resultUrl).length,
    0,
  );

  const displayFailCount = isGeneratingBatch ? failTaskCount : Math.max(failTaskCount, liveFailCount);
  const displaySuccessCount = isGeneratingBatch
    ? successTaskCount
    : successfulItems.reduce(
        (n, item) => n + (item.tasks || []).filter(t => t.status === 'SUCCESS' && !!t.resultUrl).length,
        0,
      );

  const currentModelName =
    availableImageModels.find(m => m.id === selectedImageGenModel)?.name || selectedImageGenModel;

  return (
    <div className={`relative max-w-[1520px] mx-auto space-y-5 rounded-3xl bg-slate-50 border border-slate-200/70 p-3 sm:p-5 ${viewMode === 'single' && successfulItems.length > 1 ? 'pr-16 sm:pr-20' : ''}`}>
      {viewMode === 'single' && successfulItems.length > 1 && (
        <nav aria-label="快速切换商品" className="absolute right-2 sm:right-3 top-64 flex flex-col items-center gap-3">
          <button type="button" aria-label="上一个商品" title="上一个商品" disabled={safeIndex === 0}
            onClick={() => setActiveItemIndex(Math.max(0, safeIndex - 1))}
            className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronUp className="h-5 w-5" /><span className="text-[10px]">上一个</span>
          </button>
          <span className="text-[10px] text-slate-400 tabular-nums">{safeIndex + 1}/{successfulItems.length}</span>
          <button type="button" aria-label="下一个商品" title="下一个商品" disabled={safeIndex === successfulItems.length - 1}
            onClick={() => setActiveItemIndex(Math.min(successfulItems.length - 1, safeIndex + 1))}
            className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-3 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronDown className="h-5 w-5" /><span className="text-[10px]">下一个</span>
          </button>
        </nav>
      )}
      {/* 🌟 顶层全景大盘 Header：整合生产大盘总览、商品切换条与交付导出动作 */}
      <BatchStage4Header
        isGeneratingBatch={isGeneratingBatch}
        totalTaskCount={totalTaskCount}
        completedTaskCount={completedTaskCount}
        displaySuccessCount={displaySuccessCount}
        displayFailCount={displayFailCount}
        hasExportableSuccess={hasExportableSuccess}
        currentModelName={currentModelName}
        showEngineSettings={showEngineSettings}
        setShowEngineSettings={setShowEngineSettings}
        availableImageModels={availableImageModels}
        selectedImageGenModel={selectedImageGenModel}
        setSelectedImageGenModel={setSelectedImageGenModel}
        selectedQuality={selectedQuality}
        setSelectedQuality={setSelectedQuality}
        selectedAspect={selectedAspect}
        setSelectedAspect={setSelectedAspect}
        viewMode={viewMode}
        setViewMode={setViewMode}
        generateAllCopywriting={generateAllCopywriting}
        handleExportZip={handleExportZip}
        isExportingZip={isExportingZip}
        successfulItems={successfulItems}
        safeIndex={safeIndex}
        setActiveItemIndex={setActiveItemIndex}
      />

      {/* 视图展现 */}
      {viewMode === 'single' ? (
        currentItem ? (
          <BatchStage4ProductItem
            key={currentItem.id}
            item={currentItem}
            productNavigation={successfulItems.length > 1 ? (
              <nav aria-label="切换交付商品" className="rounded-2xl border border-slate-200/80 bg-white p-3">
                <h3 className="px-2 py-2 text-xs font-semibold text-slate-600">商品列表 · {successfulItems.length} 款</h3>
                <div className="max-h-80 overflow-y-auto space-y-1.5">
                  {successfulItems.map((product, index) => {
                    const cover = product.selectedProductImages?.[0] || product.coverImage;
                    const copyFailed = Boolean(product.copywritingError);
                    const copyReady = Boolean(product.copywriting?.title && product.copywriting?.content);
                    return <button key={product.id} type="button" aria-current={index === safeIndex ? 'true' : undefined}
                      onClick={() => setActiveItemIndex(index)} title={product.title}
                      className={`w-full flex items-center gap-3 rounded-xl p-2 text-left transition-colors ${index === safeIndex ? 'bg-indigo-50 text-indigo-900 ring-1 ring-inset ring-indigo-200' : 'text-slate-600 hover:bg-slate-50'}`}>
                      <span className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-slate-50">
                        {cover && <LazyProxyImage src={cover} alt="" thumb width={80} className="!object-contain" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{index + 1}. {product.title}</span>
                        <span className="block mt-1 text-[11px] text-slate-500">图片已完成</span>
                        <span className={`block text-[11px] ${copyFailed ? 'text-rose-600' : 'text-slate-400'}`}>
                          {copyFailed ? '文案失败，待重试' : copyReady ? '文案已就绪' : '文案待生成'}
                        </span>
                      </span>
                    </button>;
                  })}
                </div>
              </nav>
            ) : undefined}
            generateCopywritingForProduct={generateCopywritingForProduct}
            updateItemCopywriting={updateItemCopywriting}
            retryFailedImageTasks={retryFailedImageTasks}
            retrySingleShotTask={retrySingleShotTask}
            isExportingZip={isExportingZip}
            handleExportSingleProductZip={handleExportSingleProductZip}
            handleDownloadSingleTaskImage={handleDownloadSingleTaskImage}
            setPreviewImageUrl={setPreviewImageUrl}
            onPreviewGallery={onPreviewGallery}
          />
        ) : (
          <div className="p-12 text-center text-slate-400 text-xs">暂无待交付的商品</div>
        )
      ) : viewMode === 'gallery' ? (
        /* 画廊模式：一行 2 张大图快速审阅 */
        <BatchStage4GalleryView
          successfulItems={successfulItems}
          setActiveItemIndex={setActiveItemIndex}
          onPreviewGallery={onPreviewGallery}
          setPreviewImageUrl={setPreviewImageUrl}
        />
      ) : (
        /* 全景平铺模式 */
        <div className="space-y-8 divide-y divide-slate-100">
          {successfulItems.map((item, idx) => (
            <div key={item.id} className={idx > 0 ? 'pt-8' : ''}>
              <BatchStage4ProductItem
                item={item}
                generateCopywritingForProduct={generateCopywritingForProduct}
                updateItemCopywriting={updateItemCopywriting}
                retryFailedImageTasks={retryFailedImageTasks}
                retrySingleShotTask={retrySingleShotTask}
                isExportingZip={isExportingZip}
                handleExportSingleProductZip={handleExportSingleProductZip}
                handleDownloadSingleTaskImage={handleDownloadSingleTaskImage}
                setPreviewImageUrl={setPreviewImageUrl}
                onPreviewGallery={onPreviewGallery}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
