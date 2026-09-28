import { useState } from 'react';
import { WandSparkles } from 'lucide-react';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { BatchPreviewLightbox } from '@client/shared/modals/lightbox/BatchPreviewLightbox';
import { PosterImportPanel } from './components/PosterImportPanel';
import { PosterCoverGallery } from './components/PosterCoverGallery';
import { PosterBatchHistoryDialog } from './components/PosterBatchHistoryDialog';
import { PosterSettingsDialog } from './components/PosterSettingsDialog';
import { PosterToolbar } from './components/PosterToolbar';
import { usePosterProduction } from './hooks/usePosterProduction';
import { safeBaseName, type PosterItem } from './model/posterTypes';

interface Props {
  onBack: () => void;
  onOpenSettings?: () => void;
}

export default function HeadlinePosterStudio({ onBack, onOpenSettings }: Props) {
  const studio = usePosterProduction();
  const [isGalleryMode, setIsGalleryMode] = useState(false);
  const [isNewBatchConfirming, setIsNewBatchConfirming] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const pendingCount = studio.items.filter((item) => item.status === 'idle' || item.status === 'interrupted').length;
  const startBatch = () => {
    setIsGalleryMode(true);
    void studio.runBatch();
  };
  const confirmNewBatch = () => {
    studio.clearItems();
    studio.setPasteText('');
    studio.setImportMode('file');
    studio.setIsDraggingFile(false);
    setIsGalleryMode(false);
    setIsNewBatchConfirming(false);
  };

  const openPreview = (item: PosterItem) => {
    const images = Array.from(new Set([item.sourceImageUrl, item.resultUrl].filter((url): url is string => Boolean(url))));
    const activeImage = item.resultUrl || item.sourceImageUrl;
    studio.setPreviewState({ itemId: item.id, index: Math.max(0, images.indexOf(activeImage)) });
  };

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto bg-transparent text-slate-900">
      <div className="min-h-full w-full px-4 py-4 sm:px-6 lg:px-8">
        <PosterToolbar
          onBack={onBack}
          failedCount={studio.failedCount}
          completedCount={studio.completedCount}
          pendingCount={pendingCount}
          isRunning={studio.isRunning}
          isExporting={studio.isExporting}
          hasItems={studio.items.length > 0}
          historyCount={studio.historyBatches.length}
          isNewBatchConfirming={isNewBatchConfirming}
          onOpenSettings={studio.openProductionSettings}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onRetryFailed={() => void studio.runBatch(true)}
          onExport={() => void studio.exportZip()}
          onStartBatch={startBatch}
          onStop={studio.stopBatch}
          onRequestNewBatch={() => setIsNewBatchConfirming(true)}
          onCancelNewBatch={() => setIsNewBatchConfirming(false)}
          onConfirmNewBatch={confirmNewBatch}
        />

      <main className={`mx-auto w-full ${isGalleryMode ? 'max-w-none' : 'max-w-[1120px]'} space-y-5 pb-10 pt-1 sm:pt-2`}>
          {isGalleryMode ? (
            <PosterCoverGallery
              items={studio.items}
              isRunning={studio.isRunning}
              compact
              onPreview={openPreview}
              onDownload={(item, index) => void studio.downloadOne(item, index)}
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

              {studio.notice && studio.items.length === 0 && !studio.isSettingsOpen && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700 flex items-center gap-2"><WandSparkles className="w-4 h-4 shrink-0" />{studio.notice}</div>
              )}

              {studio.items.length > 0 && (
                <PosterCoverGallery
                  items={studio.items}
                  isRunning={studio.isRunning}
                  onPreview={openPreview}
                  onDownload={(item, index) => void studio.downloadOne(item, index)}
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
              isRunning={studio.isRunning}
              onClose={studio.closeProductionSettings}
              onChange={(next) => studio.setSettingsDraft(next)}
              onSave={studio.saveProductionSettings}
              onOpenSettings={onOpenSettings}
            />
          )}

          {isHistoryOpen && (
            <PosterBatchHistoryDialog
              batches={studio.historyBatches}
              activeBatchId={studio.activeBatchId}
              onClose={() => setIsHistoryOpen(false)}
              onRestore={async (batch) => {
                await studio.restoreHistoryBatch(batch);
                setIsGalleryMode(true);
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
            handleDownloadSingleTaskImage={(url, fallbackName) => { void (async () => saveToDownloadDir(`${safeBaseName(studio.previewItem?.originalTitle || fallbackName, fallbackName)}.jpg`, await fetchMediaBlob(url)))(); }}
          />
        </main>
      </div>
    </div>
  );
}
