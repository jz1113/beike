import type { Dispatch, SetStateAction } from 'react';
import { batchHistoryTitle } from '../../model/workspace/batchHistory';
import type { WorkshopBatch } from '@shared/workshopSnapshot';
import type { useBatchWorkshopRunner } from '../../hooks/useBatchWorkshopRunner';
import type { BatchProductItem } from '../../model/batchTypes';
import { exportBatchZip, exportBatchExcel, exportSingleProductZip, downloadSingleTaskImage } from '../../model/delivery/batchRunnerExport';
import BatchStage4Queue from '../stage/BatchStage4Queue';
import { WorkshopAssetBindings } from '../settings/WorkshopAssetBindings';

interface BatchWorkshopHistoryPreviewProps {
  batch: WorkshopBatch;
  runner: ReturnType<typeof useBatchWorkshopRunner>;
  isHistoryExporting: boolean;
  historyExportItemId: string | null;
  setIsHistoryExporting: Dispatch<SetStateAction<boolean>>;
  setHistoryExportItemId: Dispatch<SetStateAction<string | null>>;
  onClose: () => void;
}

export function BatchWorkshopHistoryPreview({ batch, runner, isHistoryExporting, historyExportItemId, setIsHistoryExporting, setHistoryExportItemId, onClose }: BatchWorkshopHistoryPreviewProps) {
  const historyExportDeps = {
    setIsExportingZip: setIsHistoryExporting,
    setExportingSingleItemId: setHistoryExportItemId,
    setToastMsg: (msg: string | null) => { if (msg) runner.showToast(msg); },
    showToast: runner.showToast,
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 dark:border-indigo-400/20 dark:bg-indigo-500/10">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 dark:text-slate-100">历史批次生成查看 · {batchHistoryTitle(batch)}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">历史批次内容只读；此前已采用的完整四镜仍可提炼为新母本。</p>
        </div>
        <button type="button" onClick={() => onClose()} className="shrink-0 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 dark:bg-[#18191c]">返回当前批次</button>
      </div>
      <WorkshopAssetBindings snapshot={batch.snapshot} />
      <BatchStage4Queue
        successfulItems={batch.snapshot.items.filter(item => item.tasks.some(task => task.resultStatus !== 'superseded')) as BatchProductItem[]}
        selectedVisionModel={runner.availableVisionModels.some((model) => model.id === batch.snapshot.settings.selectedVisionModel)
          ? batch.snapshot.settings.selectedVisionModel : runner.selectedVisionModel}
        availableImageModels={runner.availableImageModels}
        selectedImageGenModel={batch.snapshot.settings.selectedImageGenModel}
        selectedQuality={batch.snapshot.settings.selectedQuality}
        selectedAspect={batch.snapshot.settings.selectedAspect}
        isGeneratingBatch={false}
      generateCopywritingForProduct={async () => {}}
        isExportingZip={isHistoryExporting}
        exportingSingleItemId={historyExportItemId}
        handleExportZip={() => exportBatchZip(batch.snapshot.items as BatchProductItem[], historyExportDeps)}
        handleExportExcel={() => exportBatchExcel(batch.snapshot.items as BatchProductItem[], historyExportDeps)}
        handleExportSingleProductZip={(item) => exportSingleProductZip(item, historyExportDeps)}
        handleDownloadSingleTaskImage={(url, filename) => downloadSingleTaskImage(url, filename, runner.showToast)}
        setPreviewImageUrl={runner.setPreviewImageUrl}
        onPreviewGallery={runner.openGalleryPreview}
        readOnly
      />
    </>
  );
}
