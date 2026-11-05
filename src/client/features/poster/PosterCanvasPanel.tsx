import { Play, RotateCcw, Square } from 'lucide-react';
import Dock from '@client/shared/ui/Dock';
import { CoverSkillSheet } from './components/CoverSkillSheet';
import { PosterProductionSettings } from './components/PosterProductionSettings';
import { deconstructCoverSample } from './api/coverMemoryApi';
import { useEffect, useState, type ReactNode } from 'react';
import { CanvasBusinessNodePanel, focusCanvasBusinessNode } from '@client/shared/ui/studio/CanvasBusinessNodePanel';
import { usePosterProduction } from './hooks/usePosterProduction';
import { useCoverSampleFeed } from './hooks/useCoverSampleFeed';
import { useCoverVisionModels } from './hooks/useCoverVisionModels';
import { useCoverMemory } from './hooks/useCoverMemory';
import { CoverTemplateLibrary } from './components/CoverTemplateLibrary';
import { CoverFeedPanel } from './components/memory/CoverFeedPanel';
import { CoverMemoryStudioDialog } from './components/CoverMemoryStudioDialog';
import { PosterImportPanel } from './components/PosterImportPanel';
import { PosterCoverGallery } from './components/PosterCoverGallery';
import { PosterPreviewDialog } from './components/PosterPreviewDialog';
import { PosterBatchHistoryDialog } from './components/PosterBatchHistoryDialog';
import { type PosterItem } from './model/posterTypes';

interface Props {
  projectId: string;
  nodes: Array<{ id: string; stage: string }>;
  blockReasons: Partial<Record<string, string>>;
  onItems: (items: PosterItem[]) => void;
}

/** One production session feeds four native nodes. No standalone studio page. */
export default function PosterCanvasPanel({ projectId, nodes, blockReasons, onItems }: Props) {
  const studio = usePosterProduction(projectId);
  const [templateVersion, setTemplateVersion] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [feeding, setFeeding] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const memory = useCoverMemory(memoryOpen);
  const vision = useCoverVisionModels();
  const feed = useCoverSampleFeed(async () => { setTemplateVersion(version => version + 1); });
  const busy = !studio.isReady || studio.isRunning || studio.isImporting || studio.isRestoring || studio.isExporting;
  const pending = studio.items.filter(item => ['idle', 'interrupted'].includes(item.status)).length;
  const focus = (stage: string) => focusCanvasBusinessNode(nodes.find(node => node.stage === stage)?.id);
  useEffect(() => { onItems(studio.items); }, [onItems, studio.items]);
  const button = 'min-h-11 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40';
  const renderNode = (stage: string, label: string, content: ReactNode) => nodes.filter(node => node.stage === stage).map(node => <CanvasBusinessNodePanel key={node.id} nodeId={node.id} label={label}>
    <div className="space-y-4">
      {studio.notice && <p role="status" className="text-xs leading-5 text-slate-400">{studio.notice}</p>}
      {blockReasons[stage] && <p role="alert" className="text-sm text-rose-400">{blockReasons[stage]}</p>}
      <fieldset disabled={!!blockReasons[stage]} className="min-w-0 space-y-4">{content}</fieldset>
    </div>
  </CanvasBusinessNodePanel>);
  const gallery = (stage: 'input' | 'production' | 'export') => <PosterCoverGallery
    items={stage === 'export' ? studio.items.filter(item => item.status === 'complete') : studio.items}
    isRunning={busy} allowRetry={stage === 'production' && !blockReasons['poster-production']} allowEditTitle={stage === 'input'}
    onPreview={item => studio.setPreviewState({ itemId: item.id, index: 0 })} onEditTitle={studio.editCoverTitle}
    onDownload={item => void studio.downloadOne(item, studio.items.findIndex(row => row.id === item.id))}
    onDownloadOriginalScene={item => void studio.downloadOriginalScene(item, studio.items.findIndex(row => row.id === item.id))}
    onRetry={item => { if (!blockReasons['poster-production'] && stage === 'production') void studio.runItem(item, studio.items.findIndex(row => row.id === item.id)); }} />;
  return <>
    {renderNode('poster-template', '封面模板节点操作', <>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => setRulesOpen(true)}>封面规则</button><button type="button" className={button} onClick={() => setFeeding(value => !value)}>投喂参考样张</button><button type="button" className={button} disabled={busy} onClick={() => studio.selectTemplate('')}>自动匹配模板</button></div>
      {feeding && <CoverFeedPanel jobs={feed.jobs} models={vision.models} selectionId={vision.selectionId} effort={vision.effort} busy={feed.busy} notice={feed.notice}
        onSelectModel={vision.setSelectionId} onEffortChange={vision.setEffort} onClose={() => setFeeding(false)} onFiles={files => { void feed.addFiles(files); }} onRemove={feed.removeJob}
        onStart={() => { void feed.start(vision.selectionId, vision.effort).then(done => { if (done) { feed.clearJobs(); setFeeding(false); } }); }} onRetry={() => { void feed.retryUncertain(); }} />}
      <CoverTemplateLibrary compact refreshKey={templateVersion} selectedId={studio.memorySampleId} onFeed={() => setFeeding(true)} onUse={id => { if (!busy) { studio.selectTemplate(id); focus('poster-input'); } }} onAdvanced={() => setMemoryOpen(true)} />
    </>)}
    {renderNode('poster-input', '商品与标题节点操作', <>
      <PosterImportPanel fileInputRef={studio.fileInputRef} importMode={studio.importMode} isDraggingFile={studio.isDraggingFile} pasteText={studio.pasteText} isRunning={studio.isRunning} isBusy={busy}
        onImportMode={studio.setImportMode} onImportFile={event => { void studio.importFile(event); }} onDragOver={event => { event.preventDefault(); studio.setIsDraggingFile(true); }} onDragLeave={() => studio.setIsDraggingFile(false)} onDrop={studio.handleFileDrop} onPasteText={studio.setPasteText} onPrimaryAction={studio.importPaste} onStop={studio.stopBatch} />
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => setHistoryOpen(true)}>恢复生产记录（{studio.historyBatches.length}）</button><button type="button" className={button} disabled={!studio.items.length} onClick={() => focus('poster-production')}>定位生成节点 · {studio.items.length} 条</button></div>
      {gallery('input')}
    </>)}
    {renderNode('poster-production', '封面生成节点操作', <>
      <PosterProductionSettings settingsDraft={{ imageModel: studio.imageModel, titleModel: studio.titleModel, titleHandling: studio.titleHandling, imageQuality: studio.imageQuality, concurrency: studio.concurrency, memorySampleId: studio.memorySampleId, supplementaryRequirements: studio.supplementaryRequirements }} availableImageModels={studio.availableImageModels} availableTitleModels={studio.availableTitleModels} memorySamples={[]} isRunning={busy} onChange={studio.updateProductionSettings} />
      <p className="text-sm text-slate-400">共 {studio.items.length} 条 · 完成 {studio.completedCount} · 失败 {studio.failedCount}</p>
      <div className="beike-node-runbar"><Dock positioned={false} expandsOnHover={false} showLabels baseItemSize={38} panelHeight={48} dockHeight={48} items={[
        { icon: <Play size={16} />, label: `生成（${pending}）`, disabled: busy || !pending, onClick: () => { if (!blockReasons['poster-production']) void studio.runBatch(); } },
        { icon: <RotateCcw size={16} />, label: '重试失败', disabled: busy || !studio.failedCount, onClick: () => { if (!blockReasons['poster-production']) void studio.runBatch(true); } },
        ...(studio.isRunning ? [{ icon: <Square size={16} />, label: '停止等待', onClick: studio.stopBatch }] : []),
      ]} /></div>
      {!studio.items.length && <p className="text-sm text-slate-400">在商品与标题节点导入素材后开始生成。</p>}
      {gallery('production')}
    </>)}
    {renderNode('poster-export', '封面交付节点操作', <>
      <p className="text-sm text-slate-400">{studio.completedCount} 张成品 · 点击图片预览或下载</p>
      <button type="button" className={`${button} bg-indigo-600 text-white`} disabled={busy || !studio.completedCount} onClick={() => { void studio.exportZip(); }}>打包下载封面</button>
      {gallery('export')}
    </>)}
    {rulesOpen && <CoverSkillSheet adoptedCount={memory.memory.entries.filter(entry => entry.status === 'adopted').length} pendingCount={memory.memory.entries.filter(entry => entry.status === 'pending').length} onClose={() => setRulesOpen(false)} />}
    {memoryOpen && <CoverMemoryStudioDialog memory={memory.memory} error={memory.error} busy={memory.busy} feeding={feed.busy} onClose={() => setMemoryOpen(false)} onSetStatus={(entry, status) => { void memory.setStatus(entry, status); }} onAddCorrection={rule => { void memory.addCorrection(rule); }} onClearTrash={() => { void memory.clearTrash(); }} onRetry={sample => { void memory.run(async () => { for (const url of sample.imageUrls.slice(0, 10)) await deconstructCoverSample(url, vision.selectionId, sample.title || '封面样张', vision.effort, `retry_${sample.id}`); }); }} onRefresh={() => { void memory.refresh(); }} onRestoreRevision={memory.restoreRevision} onSaveFeedback={memory.saveFeedback} />}
    {historyOpen && <PosterBatchHistoryDialog batches={studio.historyBatches} activeBatchId={studio.activeBatchId} isBusy={busy} onClose={() => setHistoryOpen(false)} onRestore={studio.restoreHistoryBatch} onDelete={id => studio.deleteHistoryBatch(id)} />}
    {studio.previewItem && studio.previewImages[0] && <PosterPreviewDialog item={studio.previewItem} imageUrl={studio.previewImages[0]} position={0} total={1} onMove={() => {}} onClose={() => studio.setPreviewState(null)} />}
  </>;
}
