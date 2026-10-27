import { useEffect, useState } from 'react';
import type { CoverMemorySample } from '@shared/contracts/coverMemory';
import { WandSparkles } from 'lucide-react';
import { PosterPreviewDialog } from './components/PosterPreviewDialog';
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
import { posterPreviewImages, type PosterItem } from './model/posterTypes';

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
  const memory = useCoverMemory(true);
  const vision = useCoverVisionModels();
  const feed = useCoverSampleFeed(() => memory.reload());
  const refreshMemory = memory.refresh;
  useEffect(() => { if (!studio.isRunning) void refreshMemory(); }, [studio.isRunning, refreshMemory]);
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
  const retryFailedSample = async (sample: CoverMemorySample) => {
    if (!vision.selectionId) { setIsMemoryOpen(false); setIsFeedOpen(true); return; }
    await memory.run(async () => {
      for (const [index, url] of sample.imageUrls.filter(Boolean).slice(0, 10).entries()) {
        await deconstructCoverSample(url, vision.selectionId, sample.title || '封面样张', vision.effort, `retry_${sample.id}_${index}`);
      }
    });
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
    if (!await studio.clearItems()) return;
    studio.setPasteText('');
    studio.setImportMode('file');
    studio.setIsDraggingFile(false);
    setIsGalleryMode(false);
    setIsNewBatchConfirming(false);
  };

  const openPreview = (item: PosterItem) => {
    studio.setPreviewState({ itemId: item.id, index: 0 });
  };

  const previewItems = studio.items.filter((item) => posterPreviewImages(item).length > 0);
  const previewPosition = previewItems.findIndex((item) => item.id === studio.previewItem?.id);
  const movePreview = (offset: number) => {
    const item = previewItems[(previewPosition + offset + previewItems.length) % previewItems.length];
    if (item) studio.setPreviewState({ itemId: item.id, index: 0 });
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
          onOpenMemory={() => { setIsMemoryOpen(true); void memory.refresh(); }}
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
              onRetry={(sample) => { void retryFailedSample(sample); }}
              onRefresh={() => { void memory.refresh(); }}
              onRestoreRevision={memory.restoreRevision}
              onSaveFeedback={memory.saveFeedback}
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

          {studio.previewItem && studio.previewImages[0] && <PosterPreviewDialog
            item={studio.previewItem}
            imageUrl={studio.previewImages[0]}
            position={previewPosition}
            total={previewItems.length}
            onMove={movePreview}
            onClose={() => studio.setPreviewState(null)}
          />}

        </main>
      </div>
      {petLink.fallback && <CoverFeedDock open={isFeedOpen}>{feedPanel}</CoverFeedDock>}
    </div>
  );
}
