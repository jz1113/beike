import { useCallback, useEffect, useState } from 'react';
import BatchImageSelectionPanel from '../product/BatchImageSelectionPanel';
import BatchStageFooter from './BatchStageFooter';
import { useBatchConfig } from '../settings/BatchConfigContext';

export default function BatchStage2Config() {
  const config = useBatchConfig();
  const { successfulItems, analysisIssue, busy } = config;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const completedItems = successfulItems.filter(item => item.selectedProductImages.some(url => url.trim()));
  const pendingItems = successfulItems.filter(item => !item.selectedProductImages.some(url => url.trim()));
  const displayedItems = successfulItems;
  const currentFocusedIndex = displayedItems.findIndex(item => item.id === focusedId);
  const focusedIndex = Math.max(0, currentFocusedIndex);

  useEffect(() => {
    if (displayedItems.length === 0) {
      if (focusedId !== null) setFocusedId(null);
      return;
    }
    if (currentFocusedIndex < 0) setFocusedId(displayedItems[0].id);
  }, [currentFocusedIndex, displayedItems, focusedId]);

  const setFocusedIndex = (action: number | ((previous: number) => number)) => {
    const index = typeof action === 'function' ? action(focusedIndex) : action;
    setFocusedId(displayedItems[index]?.id || null);
  };
  const handleDiscardItem = useCallback((itemId: string) => {
    const index = displayedItems.findIndex(item => item.id === itemId);
    const nextItem = displayedItems[index + 1] || displayedItems[index - 1];
    setFocusedId(nextItem?.id || null);
    config.handleRemoveItem(itemId);
  }, [config, displayedItems]);
  const allImagesReady = successfulItems.length > 0 && pendingItems.length === 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">确认商品图与生产配置</h1>
          <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">每款至少选 1 张；首张作为商品身份锚图，其余图片补充外观细节。创作技能和模型可在上方调整。</p></div>
        <span className="text-xs text-slate-500 dark:text-slate-400">已选图 <b className="text-indigo-600 dark:text-indigo-300">{completedItems.length}/{successfulItems.length}</b> 款</span>
      </div>
      <div className="flex min-h-[620px] flex-1">
        <BatchImageSelectionPanel displayedItems={displayedItems} focusedIndex={focusedIndex}
          activeImgFilter={config.activeImgFilter} onFilterChange={config.setActiveImgFilter}
          setFocusedIndex={setFocusedIndex} setItems={config.setItems} onToggleImage={config.toggleProductImageSelection}
          batchSetProductImages={config.batchSetProductImages} handleRemoveItem={handleDiscardItem}
          onPreviewGallery={config.onPreviewGallery} onPreviewImage={config.onPreviewImage} />
      </div>
      {analysisIssue && allImagesReady && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">{analysisIssue}。请打开生产设置检查，或前往「素材与技能」维护创作技能。</p>}
      <BatchStageFooter onPrev={config.onPrevStage} prevLabel="返回添加商品" prevDisabled={busy}
        hint={<span className="text-xs text-slate-500 dark:text-slate-400">{pendingItems.length ? `还有 ${pendingItems.length} 款未选图` : '选图已齐，下一步生成并确认分镜'}</span>}
        primaryAction={{ label: '确认选图，分析分镜', onClick: config.onNextStage, disabled: busy || !allImagesReady || Boolean(analysisIssue) }} />
    </section>
  );
}
