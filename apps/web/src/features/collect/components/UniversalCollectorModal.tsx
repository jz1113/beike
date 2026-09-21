import React, { useState, useRef } from 'react';
import { ArrowLeft, X, Sparkles, FileSpreadsheet } from 'lucide-react';
import { handleWindowDrag, handleWindowDoubleClick } from '@/shared/desktop/windowDrag';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store';
import StyleExtractModal from '@/shared/modals/StyleExtractModal';
import { CollectorHubIcon } from '@/shared/icons';
import {
  type BatchTaskItem,
  displayMediaSrc,
  displayVideoSrc,
  handleImgError,
  isLikelyVideoUrl,
  buildCollectorAIAssistantPayload,
} from '@/features/collect/utils/collectorTypes';
import CollectorSinglePanel from '@/features/collect/components/CollectorSinglePanel';
import CollectorBatchPanel from '@/features/collect/components/CollectorBatchPanel';
import CollectorResultPanel from '@/features/collect/components/CollectorResultPanel';
import { useCollectorToast } from '@/features/collect/hooks/useCollectorToast';
import { useFocusTrap } from '@/features/collect/hooks/useFocusTrap';
import { useBatchTaskQueue } from '../hooks/useBatchTaskQueue';
import { useSingleCollect } from '../hooks/useSingleCollect';
import {
  downloadCsvTemplate,
  downloadBatchSuccessTasks,
  downloadSingleVideo,
  downloadSingleZip,
} from '../utils/collectorDownloads';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEnterWorkshop?: () => void;
}

export type { BatchTaskItem };

export default function UniversalCollectorModal({ isOpen, onClose, onEnterWorkshop }: Props) {
  const {
    setProductData,
    setStep,
    setCurrentView,
    setIsAssistantOpen,
    setAssistantAttachments,
    setAssistantInputDraft,
  } = useAppStore(
    useShallow((s) => ({
      setProductData: s.setProductData,
      setStep: s.setStep,
      setCurrentView: s.setCurrentView,
      setIsAssistantOpen: s.setIsAssistantOpen,
      setAssistantAttachments: s.setAssistantAttachments,
      setAssistantInputDraft: s.setAssistantInputDraft,
    })),
  );

  // 当前主 Tab
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');

  // 详情查看模态状态
  const [inspectingItem, setInspectingItem] = useState<any | null>(null);
  const [inspectingSelectedImages, setInspectingSelectedImages] = useState<string[]>([]);

  // 大图全屏查看 Lightbox 状态
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // 下载状态
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);

  // 风格提炼弹窗联动
  const [isStyleExtractOpen, setIsStyleExtractOpen] = useState(false);

  // Toast 提示
  const { toastMsg, showToast } = useCollectorToast();

  // 模态框容器 ref，用于焦点陷阱
  const modalCardRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalCardRef, isOpen, onClose);

  // 单条极速采集 Hook
  const single = useSingleCollect({ showToast });

  // 批量任务队列 Hook
  const batch = useBatchTaskQueue({
    isOpen,
    showToast,
  });

  // 一键带入商用生图工坊
  const handleImportToWorkshop = (item: any) => {
    const allImages = Array.isArray(item.images) ? item.images : [];
    const mainImages =
      Array.isArray(item.mainImages) && item.mainImages.length > 0
        ? item.mainImages
        : allImages.slice(0, 5);
    const skuImages = Array.isArray(item.skuImages) ? item.skuImages : [];
    const descImages =
      Array.isArray(item.descImages) ? item.descImages : allImages.slice(5);

    setProductData(
      {
        title: item.title || '精选采集商品',
        price: item.price || '99.00',
        category: item.category || '数码美妆/服饰鞋包',
        skuId: item.skuId || 'COLLECTOR_SKU',
      },
      {
        main: mainImages,
        skus: skuImages,
        details: descImages,
      },
    );

    setStep(1);
    if (onEnterWorkshop) {
      onEnterWorkshop();
    } else {
      const store = useAppStore.getState();
      store.setWorkshopMode('storyboard_generate');
      store.setActiveWorkshopTab('studio');
      setCurrentView('workshop');
    }
    onClose();
    showToast('🚀 已成功将全套高清素材带入「商业视觉工坊」！');
  };

  // 一键导入 AI 助手输入框
  const handleImportToAIAssistant = (
    item: any,
    customPrompt?: string,
    customImages?: string[],
    includeVideo?: boolean,
  ) => {
    const payload = buildCollectorAIAssistantPayload({
      item,
      customPrompt,
      customImages,
      includeVideo,
      selectedVideo: single.selectedVideo,
      selectedSingleImages: single.selectedSingleImages,
      singleCollectedResultId: single.singleCollectedResult?.id,
      aiAssistantPrompt: single.aiAssistantPrompt,
    });

    if (!payload || payload.attachments.length === 0) {
      showToast('⚠️ 未检测到有效素材或原视频，请重新选择后再导入');
      return;
    }

    setAssistantAttachments(payload.attachments);
    setAssistantInputDraft(payload.prompt);
    setIsAssistantOpen(true);
    onClose();
    const videoHint = payload.hasVideo ? '（含原视频）' : '';
    showToast(`🤖 已成功将 ${payload.attachments.length} 项素材${videoHint}导入 AI 助手！`);
  };

  const handleBackHome = () => {
    setCurrentView('home');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="collector-modal-title"
      aria-describedby="collector-modal-desc"
      className="fixed inset-0 z-50 animate-fade-in select-none bg-[#fbfcfe] text-slate-900"
    >
      <input
        ref={batch.fileInputRef}
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,.xls"
        onChange={batch.handleFileUpload}
        className="hidden"
        aria-hidden="true"
      />

      <div
        ref={modalCardRef}
        className="relative flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.38)_1px,transparent_1.4px)] bg-[size:24px_24px] text-left"
      >
        {/* 轻量顶部操作条：与大字报页面保持一致 */}
        <header
          data-tauri-drag-region
          onMouseDown={handleWindowDrag}
          onDoubleClick={handleWindowDoubleClick}
          className="relative z-10 flex min-h-11 shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8 cursor-default"
        >
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={handleBackHome}
            className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur transition-colors hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
            aria-label="返回首页"
            title="返回首页"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 text-white">
              <CollectorHubIcon className="h-5 w-5" />
            </span>
            <span className="text-sm font-black tracking-tight">全渠道采集</span>
            <ArrowLeft className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:-translate-x-0.5 group-hover:text-slate-700" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={handleBackHome}
              aria-label="返回首页"
              title="返回首页"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-400 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:text-slate-700"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* 中心工作区：大字报同款标题、切换与独立白卡 */}
        <div className="flex-1 overflow-y-auto px-4 pb-10 pt-8 sm:px-6 sm:pt-12 lg:px-8">
          <section className="mx-auto w-full max-w-[1120px]">
            <div className="mx-auto max-w-[980px] text-center">
              <h1 id="collector-modal-title" className="text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-[40px]">全渠道智能采集</h1>
              <p id="collector-modal-desc" className="mt-3 text-sm text-slate-500">粘贴商品或社媒链接，一键沉淀主图、SKU、详情图与原视频素材。</p>
              <div role="tablist" aria-label="采集模式选择" className="mt-6 inline-flex max-w-full overflow-x-auto rounded-full bg-slate-100 p-1 shadow-inner text-xs font-bold">
                <button type="button" role="tab" aria-selected={activeTab === 'single'} onClick={() => setActiveTab('single')} className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 transition-all ${activeTab === 'single' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}><Sparkles className="h-3.5 w-3.5" />单条采集</button>
                <button type="button" role="tab" aria-selected={activeTab === 'batch'} onClick={() => setActiveTab('batch')} className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 transition-all ${activeTab === 'batch' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}><FileSpreadsheet className="h-3.5 w-3.5" />批量采集{batch.batchTasks.length > 0 ? ` (${batch.batchTasks.length})` : ''}</button>
              </div>
            </div>

            <div className="mt-8">
          {activeTab === 'single' && (
            <CollectorSinglePanel
              singlePlatform={single.singlePlatform}
              setSinglePlatform={single.setSinglePlatform}
              singleInput={single.singleInput}
              setSingleInput={single.setSingleInput}
              handleSingleCollect={single.handleSingleCollect}
              isCollectingSingle={single.isCollectingSingle}
              forceRefresh={single.forceRefresh}
              setForceRefresh={single.setForceRefresh}
              singleCollectedResult={single.singleCollectedResult}
              selectedSingleImages={single.selectedSingleImages}
              setSelectedSingleImages={single.setSelectedSingleImages}
              selectedVideo={single.selectedVideo}
              setSelectedVideo={single.setSelectedVideo}
              singleImageFilter={single.singleImageFilter}
              setSingleImageFilter={single.setSingleImageFilter}
              aiAssistantPrompt={single.aiAssistantPrompt}
              setAiAssistantPrompt={single.setAiAssistantPrompt}
              isDownloadingVideo={isDownloadingVideo}
              isDownloadingZip={isDownloadingZip}
              setPreviewImageUrl={setPreviewImageUrl}
              setInspectingItem={setInspectingItem}
              setIsStyleExtractOpen={setIsStyleExtractOpen}
              handleDownloadSingleVideo={(item) => downloadSingleVideo(item, showToast, setIsDownloadingVideo)}
              handleDownloadSingleZip={(item) => downloadSingleZip(item, showToast, setIsDownloadingZip)}
              handleImportToWorkshop={handleImportToWorkshop}
              handleImportToAIAssistant={handleImportToAIAssistant}
              showToast={showToast}
            />
          )}

          {activeTab === 'batch' && (
            <CollectorBatchPanel
              batchInputMode={batch.batchInputMode}
              setBatchInputMode={batch.setBatchInputMode}
              batchTextarea={batch.batchTextarea}
              setBatchTextarea={batch.setBatchTextarea}
              handleAddTasksFromText={batch.handleAddTasksFromText}
              fileInputRef={batch.fileInputRef}
              onBatchFileSelect={batch.processBatchUploadFile}
              handleDownloadCsvTemplate={(e) => {
                e.stopPropagation();
                downloadCsvTemplate(showToast);
              }}
              batchTasks={batch.batchTasks}
              setBatchTasks={batch.setBatchTasks}
              isBatchRunning={batch.isBatchRunning}
              batchExporting={batch.batchExporting}
              batchSuccessCount={batch.batchSuccessCount}
              batchFailedCount={batch.batchFailedCount}
              batchPendingCount={batch.batchPendingCount}
              batchRunningCount={batch.batchRunningCount}
              batchConcurrency={batch.batchConcurrency}
              setBatchConcurrency={batch.setBatchConcurrency}
              handlePauseBatchTasks={batch.handlePauseBatchTasks}
              handleStartBatchTasks={batch.handleStartBatchTasks}
              handleBatchDownloadAllSuccessTasks={() => downloadBatchSuccessTasks(batch.batchTasks, showToast, batch.setBatchExporting)}
              handleDownloadSingleZip={(item) => downloadSingleZip(item, showToast, setIsDownloadingZip)}
              executeSingleTask={batch.executeSingleTask}
              setPreviewImageUrl={setPreviewImageUrl}
            />
          )}

            </div>
          </section>
        </div>
      </div>

      {inspectingItem && (
        <CollectorResultPanel
          inspectingItem={inspectingItem}
          inspectingSelectedImages={inspectingSelectedImages}
          setInspectingItem={setInspectingItem}
          setPreviewImageUrl={setPreviewImageUrl}
          handleImportToAIAssistant={handleImportToAIAssistant}
          handleDownloadSingleZip={(item) => downloadSingleZip(item, showToast, setIsDownloadingZip)}
        />
      )}

      {/* 大图灯箱预览 */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in cursor-zoom-out"
        >
          {isLikelyVideoUrl(previewImageUrl) || previewImageUrl === single.singleCollectedResult?.video || previewImageUrl === inspectingItem?.video ? (
            <video
              src={displayVideoSrc(previewImageUrl)}
              controls
              autoPlay
              playsInline
              className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl border border-white/20 bg-black"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={displayMediaSrc(previewImageUrl) || previewImageUrl}
              alt="高清大图预览"
              referrerPolicy="no-referrer"
              onError={(e) => handleImgError(e, previewImageUrl)}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/20"
            />
          )}
        </div>
      )}

      {/* 风格提炼弹窗联动 */}
      <StyleExtractModal
        isOpen={isStyleExtractOpen}
        onClose={() => setIsStyleExtractOpen(false)}
      />

      {/* 全局 Toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-80 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white text-xs font-semibold shadow-2xl border border-slate-700/80 backdrop-blur-md animate-fade-in flex items-center gap-2 pointer-events-none"
        >
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
