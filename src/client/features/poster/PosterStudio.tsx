import { CoverTemplateLibrary } from './components/CoverTemplateLibrary';

import { useState } from 'react';
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
  const [view, setView] = useState<'generate' | 'templates'>('generate');
  const [templateVersion, setTemplateVersion] = useState(0);
  const [templateTitle, setTemplateTitle] = useState('');
  const [onlyFailedResults, setOnlyFailedResults] = useState(false);
  const [isNewBatchConfirming, setIsNewBatchConfirming] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const memory = useCoverMemory(isMemoryOpen);
  const vision = useCoverVisionModels();
  const feed = useCoverSampleFeed(async () => { setTemplateVersion(value => value + 1); });

  const adoptedCount = memory.memory.entries.filter((entry) => entry.status === 'adopted').length;
  const pendingMemoryCount = memory.memory.entries.filter((entry) => entry.status === 'pending').length;
  const isBusy = !studio.isReady || studio.isRunning || studio.isExporting || studio.isRestoring || studio.isImporting;
  const pendingCount = studio.items.filter((item) => item.status === 'idle' || item.status === 'interrupted').length;
  const startBatch = () => { setView('generate'); void studio.runBatch(); };
  const retryItem = (item: PosterItem, index: number) => { void studio.runItem(item, index); };
  const useTemplate = (id: string, title: string) => {
    if (studio.isRunning || studio.isRestoring || studio.isImporting || studio.isExporting) return;
    studio.selectTemplate(id);
    setTemplateTitle(title);
    setView('generate');
  };
  const samples = memory.memory.samples.flatMap(sample => memory.memory.entries.some(entry => entry.sampleId === sample.id && entry.status === 'adopted' && entry.source === 'sample')
    ? [{ id: sample.id, title: sample.title || '封面样张', grouped: sample.imageUrls.length > 1 }] : []);
  const acceptFeedFiles = async (files: File[]) => {
    setIsFeedOpen(true);
    await feed.addFiles(files);
  };
  const submitFeed = async () => {
    const finished = await feed.start(vision.selectionId, vision.effort);
    if (finished) {
      feed.clearJobs();
      setIsFeedOpen(false);
      setView('templates');
      setTemplateVersion(value => value + 1);
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
    setView('generate');
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
          onOpenSettings={studio.openProductionSettings}
          onOpenRules={() => setIsRulesOpen(true)}
          onOpenMemory={() => setView('templates')}
          onOpenFeed={() => setIsFeedOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onRetryFailed={() => { setView('generate'); void studio.runBatch(true); }}
          onExport={() => void studio.exportZip()}
          onStartBatch={startBatch}
          onStop={studio.stopBatch}
          onRequestNewBatch={() => setIsNewBatchConfirming(true)}
          onCancelNewBatch={() => setIsNewBatchConfirming(false)}
          onConfirmNewBatch={() => { void confirmNewBatch(); }}
        />

        <main className={`mx-auto w-full max-w-[1280px] space-y-5 pb-10 pt-1 sm:pt-2`}>
          {!isMemoryOpen && memory.error && (
            <div role="alert" className="rounded-2xl border border-rose-100 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">{memory.error}</div>
          )}
          {studio.notice && (
            <div role="status" className="flex items-start gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#1B1B1E]/90 px-4 py-3 text-xs leading-5 text-slate-700 dark:text-slate-200 [overflow-wrap:anywhere]"><WandSparkles className="mt-0.5 h-4 w-4 shrink-0" />{studio.notice}</div>
          )}
          {studio.isImporting && <p role="status" className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><WandSparkles className="h-4 w-4 animate-pulse" />正在解析文件并保存生产清单…</p>}
          <nav aria-label="封面功能" className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setView('generate')} aria-pressed={view === 'generate'} className={`rounded-xl border px-5 py-3 text-sm font-bold ${view === 'generate' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-white/15'}`}>生成封面</button>
            <button type="button" onClick={() => setView('templates')} aria-pressed={view === 'templates'} className={`rounded-xl border px-5 py-3 text-sm font-bold ${view === 'templates' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-white/15'}`}>我的模板库</button>
          </nav>
          {view === 'templates' ? <CoverTemplateLibrary refreshKey={templateVersion} selectedId={studio.memorySampleId} onFeed={() => setIsFeedOpen(true)} onUse={useTemplate} onAdvanced={() => setIsMemoryOpen(true)} /> : <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/90 p-4 dark:border-white/10 dark:bg-[#18191c]/95">
              <span className="text-sm">使用模板：<b>{templateTitle || (studio.memorySampleId && studio.memorySampleId !== 'corrections' ? '已保存的选定模板' : studio.memorySampleId === 'corrections' ? '不使用样张模板' : '自动匹配可用模板')}</b></span>
              <button type="button" onClick={() => setView('templates')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-white/15">去模板库挑选</button>
              <button type="button" disabled={isBusy} onClick={() => { studio.selectTemplate(''); setTemplateTitle(''); }} className="text-sm text-slate-500">改为自动匹配</button>
              <p className="w-full text-xs text-slate-500">先投喂喜欢的参考封面，保存为模板；再上传商品图和文案，一键生成。已有设计的重试继续使用原模板。</p>
            </div>
            <PosterImportPanel
              fileInputRef={studio.fileInputRef} importMode={studio.importMode} isDraggingFile={studio.isDraggingFile}
              pasteText={studio.pasteText} isRunning={studio.isRunning} isBusy={isBusy} onImportMode={studio.setImportMode}
              onImportFile={async event => { await studio.importFile(event); }}
              onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; studio.setIsDraggingFile(true); }}
              onDragLeave={() => studio.setIsDraggingFile(false)} onDrop={studio.handleFileDrop} onPasteText={studio.setPasteText}
              onPrimaryAction={() => { studio.importPaste(); }} onStop={studio.stopBatch} />
            {studio.items.length > 0 && <div className="flex flex-wrap items-center gap-3"><span className="text-sm">{studio.items.length} 条商品 · 完成 {studio.completedCount} · 失败 {studio.failedCount}</span><button type="button" disabled={isBusy || !pendingCount} onClick={startBatch} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white dark:bg-white dark:text-slate-900">生成封面（{pendingCount}）</button><label className="text-sm"><input type="checkbox" checked={onlyFailedResults} onChange={event => setOnlyFailedResults(event.target.checked)} /> 只看失败与中断</label></div>}
            <PosterCoverGallery items={studio.items.filter(item => !onlyFailedResults || ['failed', 'interrupted'].includes(item.status))}
              isRunning={isBusy} onEditTitle={studio.editCoverTitle} compact onPreview={openPreview}
              onDownload={item => void studio.downloadOne(item, studio.items.findIndex(row => row.id === item.id))}
              onDownloadOriginalScene={item => void studio.downloadOriginalScene(item, studio.items.findIndex(row => row.id === item.id))}
              onRetry={item => retryItem(item, studio.items.findIndex(row => row.id === item.id))} />
          </>}

          {studio.isSettingsOpen && studio.settingsDraft && (
            <PosterSettingsDialog
              settingsDraft={studio.settingsDraft}
              availableImageModels={studio.availableImageModels}
              availableTitleModels={studio.availableTitleModels}
              isRunning={isBusy}
              onClose={studio.closeProductionSettings}
              onChange={(next) => studio.setSettingsDraft(next)}
              memorySamples={samples}
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
                if (restored) setView('generate');
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
