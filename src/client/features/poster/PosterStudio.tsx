import { useRef, useState } from 'react';
import { WandSparkles } from 'lucide-react';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { BatchPreviewLightbox } from '@client/shared/modals/lightbox/BatchPreviewLightbox';
import { PosterImportPanel } from './components/PosterImportPanel';
import { PosterCoverGallery } from './components/PosterCoverGallery';
import { PosterBatchHistoryDialog } from './components/PosterBatchHistoryDialog';
import { PosterSettingsDialog } from './components/PosterSettingsDialog';
import { CoverMemoryStudioDialog } from './components/CoverMemoryStudioDialog';
import { CoverFeedDock } from './components/memory/CoverFeedDock';
import { CoverFeedPanel } from './components/memory/CoverFeedPanel';
import { useCoverSampleFeed } from './hooks/useCoverSampleFeed';
import { useCoverPetLink } from './hooks/useCoverPetLink';
import { useCoverVisionModels } from './hooks/useCoverVisionModels';
import { CoverSkillSheet } from './components/CoverSkillSheet';
import { PosterToolbar } from './components/PosterToolbar';
import { deconstructCoverSample } from './api/coverMemoryApi';
import { useCoverMemory } from './hooks/useCoverMemory';
import { usePosterProduction } from './hooks/usePosterProduction';
import { safeBaseName, type PosterItem } from './model/posterTypes';

interface Props {
  onBack: () => void;
  onOpenSettings?: () => void;
}

export default function PosterStudio({ onBack, onOpenSettings }: Props) {
  const studio = usePosterProduction();
  const [isGalleryMode, setIsGalleryMode] = useState(false);
  const [isNewBatchConfirming, setIsNewBatchConfirming] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [previewDownloadError, setPreviewDownloadError] = useState<string | null>(null);
  const memory = useCoverMemory(true);
  const vision = useCoverVisionModels();
  const feed = useCoverSampleFeed(() => memory.reload());
  const retryingSample = useRef(false);
  const adoptedCount = memory.memory.entries.filter((entry) => entry.status === 'adopted').length;
  const pendingMemoryCount = memory.memory.entries.filter((entry) => entry.status === 'pending').length;
  const isBusy = !studio.isReady || studio.isRunning || studio.isExporting || studio.isRestoring || studio.isImporting;
  const pendingCount = studio.items.filter((item) => item.status === 'idle' || item.status === 'interrupted').length;
  const startBatch = () => {
    setIsGalleryMode(true);
    void studio.runBatch();
  };
  const acceptFeedFiles = async (files: File[]) => {
    setIsFeedOpen(true);
    await feed.addFiles(files);
  };
  const submitFeed = async () => {
    const finished = await feed.start(vision.selectionId, vision.effort);
    if (finished) {
      setIsFeedOpen(false);
      setIsMemoryOpen(true);
    }
  };
  const retryFailedSample = async (urls: string[], _model: string, title: string) => {
    if (retryingSample.current) return;
    if (!vision.selectionId) {
      setIsMemoryOpen(false);
      setIsFeedOpen(true);
      return;
    }
    retryingSample.current = true;
    try {
      for (const url of urls.filter(Boolean).slice(0, 10)) {
        await deconstructCoverSample(url, vision.selectionId, title || '封面样张', vision.effort);
      }
      await memory.reload();
    } finally {
      retryingSample.current = false;
    }
  };
  const coverModalOpen = isMemoryOpen || isHistoryOpen || isRulesOpen || studio.isSettingsOpen || Boolean(studio.previewState);
  const feedPanel = (
    <CoverFeedPanel
      jobs={feed.jobs}
      models={vision.models}
      selectionId={vision.selectionId}
      effort={vision.effort}
      busy={feed.busy}
      notice={feed.notice}
      onSelectModel={vision.setSelectionId}
      onEffortChange={vision.setEffort}
      onClose={() => setIsFeedOpen(false)}
      onFiles={(files) => { void feed.addFiles(files); }}
      onRemove={feed.removeJob}
      onStart={() => { void submitFeed(); }}
      onRetry={() => { void feed.retryUncertain(); }}
      onOpenSettings={onOpenSettings}
    />
  );
  const petLink = useCoverPetLink({
    coverModalOpen,
    open: isFeedOpen,
    setOpen: setIsFeedOpen,
    phase: feed.phase,
    modelLabel: vision.label,
    onFiles: (files) => { void acceptFeedFiles(files); },
    onDragging: feed.setDragging,
    panel: feedPanel,
  });
  const confirmNewBatch = async () => {
    if (isBusy) return;
    setPreviewDownloadError(null);
    if (!await studio.clearItems()) return;
    studio.setPasteText('');
    studio.setImportMode('file');
    studio.setIsDraggingFile(false);
    setIsGalleryMode(false);
    setIsNewBatchConfirming(false);
  };

  const openPreview = (item: PosterItem) => {
    setPreviewDownloadError(null);
    const images = Array.from(new Set([item.sourceImageUrl, item.generatedSceneUrl, item.resultUrl].filter((url): url is string => Boolean(url))));
    const activeImage = item.resultUrl || item.generatedSceneUrl || item.sourceImageUrl;
    studio.setPreviewState({ itemId: item.id, index: Math.max(0, images.indexOf(activeImage)) });
  };

  const downloadPreview = async (url: string, fallbackName: string) => {
    setPreviewDownloadError(null);
    const item = studio.previewItem;
    try {
      const blob = await fetchMediaBlob(url);
      const extension = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[blob.type.split(';')[0].toLowerCase()] || 'img';
      const suffix = item?.resultUrl === url ? '' : item?.generatedSceneUrl === url ? '_原生图' : '_参考图';
      await saveToDownloadDir(`${safeBaseName(item?.originalTitle || fallbackName, fallbackName)}${suffix}.${extension}`, blob);
    } catch (error) {
      setPreviewDownloadError(`下载失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto bg-transparent text-slate-900 dark:text-slate-100">
      <div className="min-h-full w-full px-4 py-4 sm:px-6 lg:px-8">
        <PosterToolbar
          onBack={onBack}
          failedCount={studio.failedCount}
          completedCount={studio.completedCount}
          pendingCount={pendingCount}
          isRunning={studio.isRunning}
          isExporting={studio.isExporting}
          isRestoring={studio.isRestoring}
          isImporting={studio.isImporting}
          isReady={studio.isReady}
          hasItems={studio.items.length > 0}
          historyCount={studio.historyBatches.length}
          isNewBatchConfirming={isNewBatchConfirming}
          isFeeding={feed.busy}
          adoptedCount={adoptedCount}
          pendingMemoryCount={pendingMemoryCount}
          onOpenSettings={studio.openProductionSettings}
          onOpenRules={() => setIsRulesOpen(true)}
          onOpenMemory={() => setIsMemoryOpen(true)}
          onOpenFeed={() => setIsFeedOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onRetryFailed={() => void studio.runBatch(true)}
          onExport={() => void studio.exportZip()}
          onStartBatch={startBatch}
          onStop={studio.stopBatch}
          onRequestNewBatch={() => setIsNewBatchConfirming(true)}
          onCancelNewBatch={() => setIsNewBatchConfirming(false)}
          onConfirmNewBatch={() => { void confirmNewBatch(); }}
        />

        <main className={`mx-auto w-full ${isGalleryMode ? 'max-w-none' : 'max-w-[1120px]'} space-y-5 pb-10 pt-1 sm:pt-2`}>
          {!isMemoryOpen && memory.error && (
            <div role="alert" className="rounded-2xl border border-rose-100 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">{memory.error}</div>
          )}
          {studio.notice && (
            <div role="status" className="flex items-start gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#1B1B1E]/90 px-4 py-3 text-xs leading-5 text-slate-700 dark:text-slate-200 [overflow-wrap:anywhere]"><WandSparkles className="mt-0.5 h-4 w-4 shrink-0" />{studio.notice}</div>
          )}
          {studio.isImporting && <p role="status" className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><WandSparkles className="h-4 w-4 animate-pulse" />正在解析文件并保存生产清单…</p>}
          {previewDownloadError && (
            <div role="alert" className={`rounded-2xl border border-rose-100 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-700 dark:text-rose-300 ${studio.previewState ? 'fixed left-1/2 top-20 z-[210] max-w-[90vw] -translate-x-1/2 shadow-lg' : ''}`}>{previewDownloadError}</div>
          )}
          {isGalleryMode ? (
            <PosterCoverGallery
              items={studio.items}
              isRunning={isBusy}
              onEditTitle={studio.editCoverTitle}
              compact
              onPreview={openPreview}
              onDownload={(item, index) => void studio.downloadOne(item, index)}
              onDownloadOriginalScene={(item, index) => void studio.downloadOriginalScene(item, index)}
              onRetry={(item, index) => void studio.runItem(item, index)}
            />
          ) : (
            <>
              <PosterImportPanel
                fileInputRef={studio.fileInputRef}
                importMode={studio.importMode}
                isDraggingFile={studio.isDraggingFile}
                pasteText={studio.pasteText}
                isRunning={studio.isRunning}
                isBusy={isBusy}
                onImportMode={studio.setImportMode}
                onImportFile={(event) => void studio.importFile(event)}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; studio.setIsDraggingFile(true); }}
                onDragLeave={() => studio.setIsDraggingFile(false)}
                onDrop={studio.handleFileDrop}
                onPasteText={studio.setPasteText}
                onPrimaryAction={() => {
                  if (studio.importPaste()) setIsGalleryMode(true);
                }}
                onStop={studio.stopBatch}
              />

              {studio.items.length > 0 && (
                <PosterCoverGallery
                  items={studio.items}
                  isRunning={isBusy}
                  onEditTitle={studio.editCoverTitle}
                  onPreview={openPreview}
                  onDownload={(item, index) => void studio.downloadOne(item, index)}
                  onDownloadOriginalScene={(item, index) => void studio.downloadOriginalScene(item, index)}
                  onRetry={(item, index) => void studio.runItem(item, index)}
                />
              )}
            </>
          )}

          {studio.isSettingsOpen && studio.settingsDraft && (
            <PosterSettingsDialog
              settingsDraft={studio.settingsDraft}
              availableImageModels={studio.availableImageModels}
              availableTitleModels={studio.availableTitleModels}
              isRunning={isBusy}
              onClose={studio.closeProductionSettings}
              onChange={(next) => studio.setSettingsDraft(next)}
              memorySamples={memory.memory.samples.flatMap((sample) => {
                const adopted = memory.memory.entries.some((entry) => entry.sampleId === sample.id && entry.status === 'adopted' && entry.source === 'sample');
                return adopted ? [{ id: sample.id, title: sample.title || '封面样张', grouped: sample.imageUrls.length > 1 }] : [];
              })}
              onSave={studio.saveProductionSettings}
              onOpenSettings={onOpenSettings}
            />
          )}

          {isMemoryOpen && (
            <CoverMemoryStudioDialog
              memory={memory.memory}
              error={memory.error}
              busy={memory.busy}
              feeding={feed.busy}
              onClose={() => setIsMemoryOpen(false)}
              onSetStatus={(entry, status) => { void memory.setStatus(entry, status); }}
              onAddCorrection={(rule) => { void memory.addCorrection(rule); }}
              onClearTrash={() => { void memory.clearTrash(); }}
              onRetry={(urls, model, title) => { void retryFailedSample(urls, model, title); }}
            />
          )}

          {isRulesOpen && <CoverSkillSheet adoptedCount={adoptedCount} pendingCount={pendingMemoryCount} onClose={() => setIsRulesOpen(false)} />}

          {isHistoryOpen && (
            <PosterBatchHistoryDialog
              batches={studio.historyBatches}
              activeBatchId={studio.activeBatchId}
              isBusy={isBusy}
              onClose={() => setIsHistoryOpen(false)}
              onRestore={async (batch) => {
                const restored = await studio.restoreHistoryBatch(batch);
                if (restored) setIsGalleryMode(true);
                return restored;
              }}
              onDelete={(id) => studio.deleteHistoryBatch(id)}
            />
          )}

          <BatchPreviewLightbox
            previewImageUrl={null}
            previewGallery={studio.previewItem && studio.previewState && studio.previewImages.length > 0
              ? { images: studio.previewImages, currentIndex: studio.previewState.index, title: `${studio.previewItem.originalTitle || '商品素材'} · 大图预览` }
              : null}
            closeGalleryPreview={() => studio.setPreviewState(null)}
            setGalleryIndex={(nextIndex) => studio.setPreviewState((previous) => previous && studio.previewImages.length > 0 ? { ...previous, index: (nextIndex + studio.previewImages.length) % studio.previewImages.length } : previous)}
            handleDownloadSingleTaskImage={(url, fallbackName) => { void downloadPreview(url, fallbackName); }}
          />
        </main>
      </div>
      {petLink.fallback && <CoverFeedDock open={isFeedOpen}>{feedPanel}</CoverFeedDock>}
    </div>
  );
}
