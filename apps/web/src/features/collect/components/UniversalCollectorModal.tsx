import React, { useState, useRef } from 'react';
import { X, History, Sparkles, FileSpreadsheet } from 'lucide-react';
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
import CollectorHistoryPanel from '@/features/collect/components/CollectorHistoryPanel';
import CollectorResultPanel from '@/features/collect/components/CollectorResultPanel';
import { useCollectorToast } from '@/features/collect/hooks/useCollectorToast';
import { useFocusTrap } from '@/features/collect/hooks/useFocusTrap';
import { useCollectorHistory } from '../hooks/useCollectorHistory';
import { useBatchTaskQueue } from '../hooks/useBatchTaskQueue';
import { useSingleCollect } from '../hooks/useSingleCollect';
import {
  downloadCsvTemplate,
  downloadBatchSuccessTasks,
  downloadBatchSelectedHistory,
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
  const [activeTab, setActiveTab] = useState<'single' | 'batch' | 'history'>('single');

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

  // 专属汇总库 Hook
  const history = useCollectorHistory(isOpen);

  // 单条极速采集 Hook
  const single = useSingleCollect({
    showToast,
    saveToCollectorHistory: history.saveToCollectorHistory,
  });

  // 批量任务队列 Hook
  const batch = useBatchTaskQueue({
    isOpen,
    showToast,
    saveToCollectorHistory: history.saveToCollectorHistory,
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

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="collector-modal-title"
      aria-describedby="collector-modal-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-md animate-fade-in select-none"
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
        className="relative w-full max-w-6xl max-h-[92vh] h-[860px] rounded-[32px] bg-white border border-slate-200/90 shadow-[0_25px_70px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden text-left"
      >
        {/* Header 导航条 */}
        <header
          data-tauri-drag-region
          onMouseDown={handleWindowDrag}
          onDoubleClick={handleWindowDoubleClick}
          className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between gap-4 flex-shrink-0 bg-white cursor-default"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 flex-shrink-0">
              <CollectorHubIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 id="collector-modal-title" className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  全渠道智能采集中心
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold font-mono">
                  Universal Collector
                </span>
              </div>
              <p id="collector-modal-desc" className="text-xs text-slate-500 mt-0.5">
                支持京东 / 淘宝 / 天猫 / 1688 / 拼多多全景素材与小红书 / 抖音社媒无水印爆款图集
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div role="tablist" aria-label="采集模式选择" className="p-1 rounded-2xl bg-slate-100/90 border border-slate-200/70 flex items-center gap-1 shadow-inner text-xs font-bold">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'single'}
                onClick={() => setActiveTab('single')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'single'
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                <span>单条极速采集</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'batch'}
                onClick={() => setActiveTab('batch')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 relative ${
                  activeTab === 'batch'
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                <span>批量任务采集</span>
                {batch.batchTasks.length > 0 && (
                  <span aria-label={`任务数 ${batch.batchTasks.length}`} className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-mono">
                    {batch.batchTasks.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'history'}
                onClick={() => setActiveTab('history')}
                className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-white text-slate-950 shadow-sm border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <History className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                <span>采集汇总库 ({history.historyItems.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="关闭采集中心"
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer border border-transparent hover:border-slate-200"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* 主内容区域 */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
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

          {activeTab === 'history' && (
            <CollectorHistoryPanel
              historyItems={history.historyItems}
              setHistoryItems={history.setHistoryItems}
              historyFilter={history.historyFilter}
              setHistoryFilter={history.setHistoryFilter}
              historySearch={history.historySearch}
              setHistorySearch={history.setHistorySearch}
              filteredHistory={history.filteredHistory}
              selectedHistoryIds={history.selectedHistoryIds}
              setSelectedHistoryIds={history.setSelectedHistoryIds}
              isDownloadingZip={isDownloadingZip}
              handleBatchDownloadSelectedHistory={() => downloadBatchSelectedHistory(history.historyItems, history.selectedHistoryIds, showToast, setIsDownloadingZip)}
              handleDownloadSingleZip={(item) => downloadSingleZip(item, showToast, setIsDownloadingZip)}
              handleImportToAIAssistant={handleImportToAIAssistant}
              handleImportToWorkshop={handleImportToWorkshop}
              setInspectingItem={setInspectingItem}
              setInspectingSelectedImages={setInspectingSelectedImages}
              showToast={showToast}
            />
          )}
        </div>

        {/* 底部状态栏 */}
        <footer className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span>全渠道采集专线已就绪 · 支持一键全网解析、多链接/表格批量导入与成套 ZIP 打包下载</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="完成并关闭采集中心"
            className="px-4 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold transition-all cursor-pointer shadow-2xs"
          >
            完成并关闭
          </button>
        </footer>
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
