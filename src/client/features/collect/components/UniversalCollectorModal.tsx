import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, FileSpreadsheet, FileVideo } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import StyleExtractModal from '@client/shared/modals/StyleExtractModal';
import {
  type BatchTaskItem,
  buildCollectorAIAssistantPayload,
  collectedVideos,
} from '@client/features/collect/model/collectorTypes';
import CollectorMediaPreview from './CollectorMediaPreview';
import { useCollectorDownloads } from '../hooks/useCollectorDownloads';
import { buildCollectorWorkshopPayload } from '../model/collectorWorkshopImport';
import CollectorSinglePanel from '@client/features/collect/components/CollectorSinglePanel';
import CollectorBatchPanel from '@client/features/collect/components/CollectorBatchPanel';
import CollectorVideoDownloadPanel from '@client/features/collect/components/CollectorVideoDownloadPanel';
import CollectorResultPanel from '@client/features/collect/components/CollectorResultPanel';
import { useCollectorToast } from '@client/features/collect/hooks/useCollectorToast';
import { useFocusTrap } from '@client/features/collect/hooks/useFocusTrap';
import { useBatchTaskQueue } from '../hooks/useBatchTaskQueue';
import { useSingleCollect } from '../hooks/useSingleCollect';
import {
  downloadCsvTemplate,
  downloadBatchSuccessTasks,
  downloadSingleVideo,
  downloadSingleZip,
} from '../api/collectorDownloads';

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
  const [activeTab, setActiveTab] = useState<'single' | 'batch' | 'video'>('single');

  // 详情查看模态状态
  const [inspectingItem, setInspectingItem] = useState<any | null>(null);
  const [inspectingSelectedImages] = useState<string[]>([]);

  // 大图全屏查看 Lightbox 状态
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // 风格提炼弹窗联动
  const [isStyleExtractOpen, setIsStyleExtractOpen] = useState(false);

  const [styleExtractSource, setStyleExtractSource] = useState<{ images: string[]; title?: string }>({ images: [] });

  // Toast 提示
  const { toastMsg, showToast } = useCollectorToast();

  const { isDownloadingZip, isDownloadingVideo, runZipDownload, runVideoDownload } = useCollectorDownloads(isOpen, showToast);
  const ignoreLoading = () => {};
  const handleDownloadSingleZip = (item: any) => runZipDownload(signal => downloadSingleZip(item, showToast, ignoreLoading, signal));
  const handleDownloadSingleVideo = (item: any) => runVideoDownload(signal => downloadSingleVideo(item, showToast, ignoreLoading, signal));

  // 模态框容器 ref，用于焦点陷阱
  const modalCardRef = useRef<HTMLDivElement | null>(null);
  const styleDialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalCardRef, isOpen, onClose);
  useFocusTrap(styleDialogRef, isOpen && isStyleExtractOpen, () => setIsStyleExtractOpen(false));
  useEffect(() => {
    if (!isOpen) {
      setInspectingItem(null);
      setPreviewImageUrl(null);
      setIsStyleExtractOpen(false);
    }
  }, [isOpen]);

  // 单条极速采集 Hook
  const single = useSingleCollect({ isOpen, showToast });

  // 批量任务队列 Hook
  const batch = useBatchTaskQueue({
    isOpen,
    showToast,
  });

  // 一键带入商用生图工坊
  const handleImportToWorkshop = (item: any) => {
    const payload = buildCollectorWorkshopPayload(item);
    if (!payload) { showToast('请先采集可用图片，再带入商业视觉工坊'); return; }
    setProductData(payload.product, payload.images);

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
      className="fixed inset-0 z-50 animate-fade-in select-none bg-[#fbfcfe] text-slate-900"
    >
      <input
        ref={batch.fileInputRef}
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,.xls"
        onChange={batch.handleFileUpload}
        className="hidden"
      />

      <div
        ref={modalCardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collector-modal-title"
        aria-describedby="collector-modal-desc"
        aria-hidden={Boolean(inspectingItem || previewImageUrl || isStyleExtractOpen)}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.38)_1px,transparent_1.4px)] bg-[size:24px_24px] text-left"
      >
        {/* 轻量顶部操作条：与大字报页面保持一致 */}
        <header
          className="relative z-10 flex min-h-11 shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8 cursor-default"
        >
          <button
            type="button"
            onClick={handleBackHome}
            className="group inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 shadow-sm backdrop-blur transition-colors hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
            aria-label="返回首页"
            title="返回首页"
          >
            <img src="/brand/content-collect.jpg" alt="" draggable={false} className="h-8 w-8 shrink-0 object-contain" />
            <span className="text-sm font-black tracking-tight">内容采集</span>
          </button>
        </header>

        {/* 中心工作区：大字报同款标题、切换与独立白卡 */}
        <div className="flex-1 overflow-y-auto px-4 pb-10 pt-8 sm:px-6 sm:pt-12 lg:px-8">
          <section className="mx-auto w-full max-w-[1120px]">
            <div className="mx-auto max-w-[980px] text-center">
              <h1 id="collector-modal-title" className="text-3xl font-black tracking-[-0.045em] text-slate-950 sm:text-[40px]">内容采集</h1>
              <p id="collector-modal-desc" className="mt-3 text-sm text-slate-500">{activeTab === 'batch' ? '粘贴多条链接或导入表格，批量收集商品图片与社媒素材。' : activeTab === 'video' ? '导入含标题和视频链接的表格，按标题批量下载到本地文件夹。' : '一个链接，收集商品图片与社媒素材。'}</p>
              <div role="tablist" aria-label="采集模式选择" className="mt-6 inline-flex max-w-full overflow-x-auto rounded-full bg-slate-100 p-1 shadow-inner text-sm font-medium">
                <button type="button" role="tab" aria-selected={activeTab === 'single'} onClick={() => setActiveTab('single')} className={`inline-flex shrink-0 items-center justify-center gap-1.5 min-w-[150px] rounded-full px-5 py-2.5 transition-all ${activeTab === 'single' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}><Sparkles className="h-3.5 w-3.5" />单条采集</button>
                <button type="button" role="tab" aria-selected={activeTab === 'batch'} onClick={() => setActiveTab('batch')} className={`inline-flex shrink-0 items-center justify-center gap-1.5 min-w-[150px] rounded-full px-5 py-2.5 transition-all ${activeTab === 'batch' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}><FileSpreadsheet className="h-3.5 w-3.5" />批量采集{batch.batchTasks.length > 0 ? ` (${batch.batchTasks.length})` : ''}</button>
                <button type="button" role="tab" aria-selected={activeTab === 'video'} onClick={() => setActiveTab('video')} className={`inline-flex shrink-0 items-center justify-center gap-1.5 min-w-[150px] rounded-full px-5 py-2.5 transition-all ${activeTab === 'video' ? 'bg-black text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}><FileVideo className="h-3.5 w-3.5" />oss视频下载</button>
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
              onExtractStyle={(images, title) => {
                setStyleExtractSource({ images, title });
                setIsStyleExtractOpen(true);
              }}
              handleDownloadSingleVideo={handleDownloadSingleVideo}
              handleDownloadSingleZip={handleDownloadSingleZip}
              handleImportToWorkshop={handleImportToWorkshop}
              handleImportToAIAssistant={handleImportToAIAssistant}
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
              isBatchImporting={batch.isBatchImporting}
              cancelBatchImport={batch.cancelBatchImport}
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
              handleBatchDownloadAllSuccessTasks={() => runZipDownload(signal => downloadBatchSuccessTasks(batch.batchTasks, showToast, batch.setBatchExporting, signal))}
              handleDownloadSingleZip={handleDownloadSingleZip}
              executeSingleTask={batch.executeSingleTask}
              setPreviewImageUrl={setPreviewImageUrl}
            />
          )}

          {activeTab === 'video' && <CollectorVideoDownloadPanel showToast={showToast} />}

            </div>
          </section>
        </div>
      </div>

      {inspectingItem && (
        <CollectorResultPanel
          inspectingItem={inspectingItem}
          hasPreview={Boolean(previewImageUrl)}
          isDownloadingZip={isDownloadingZip}
          inspectingSelectedImages={inspectingSelectedImages}
          setInspectingItem={setInspectingItem}
          setPreviewImageUrl={setPreviewImageUrl}
          handleImportToAIAssistant={handleImportToAIAssistant}
          handleDownloadSingleZip={handleDownloadSingleZip}
        />
      )}

      {previewImageUrl && (
        <CollectorMediaPreview
          url={previewImageUrl}
          videoUrls={[...collectedVideos(single.singleCollectedResult), ...collectedVideos(inspectingItem), ...batch.batchTasks.flatMap(collectedVideos)]}
          onClose={() => setPreviewImageUrl(null)}
        />
      )}

      <div ref={styleDialogRef} tabIndex={-1} role={isStyleExtractOpen ? 'dialog' : undefined} aria-modal={isStyleExtractOpen || undefined} aria-label="风格提炼">
        <StyleExtractModal
          isOpen={isStyleExtractOpen}
          initialImages={styleExtractSource.images}
          initialTitle={styleExtractSource.title}
          onClose={() => setIsStyleExtractOpen(false)}
        />
      </div>

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
