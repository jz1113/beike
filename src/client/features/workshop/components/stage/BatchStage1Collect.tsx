import type { Dispatch, SetStateAction } from 'react';
import { BatchProductItem } from '../../model/batchTypes';
import { BatchStage1OverviewCard } from './BatchStage1OverviewCard';
import { BatchStage1InputCard } from './BatchStage1InputCard';
import BatchProgressBar from '../delivery/BatchProgressBar';
import { ArrowRight, PackageCheck } from 'lucide-react';

interface Props {
  batchInputText: string;
  setBatchInputText: (val: string) => void;
  items: BatchProductItem[];
  setItems?: Dispatch<SetStateAction<BatchProductItem[]>>;
  isCollecting: boolean;
  onContinue: () => void;
  collectProgress: { total: number; current: number; success: number; failed: number };
  handleParseInput: () => BatchProductItem[];
  startBatchCollect: (itemsToCollect?: BatchProductItem[], forceRefresh?: boolean) => Promise<void>;
}

export default function BatchStage1Collect({
  batchInputText, setBatchInputText, items, setItems, isCollecting,
  collectProgress, handleParseInput, startBatchCollect, onContinue,
}: Props) {
  const retryItems = items.filter(item => item.status === 'failed' || item.status === 'pending');
  const hasInputs = Boolean(batchInputText.trim() || retryItems.length > 0);
  const handleSmartBatchCollect = async () => {
    if (batchInputText.trim()) {
      const newItems = handleParseInput();
      if (newItems.length === 0 && retryItems.length === 0) return;
      await startBatchCollect([...newItems, ...retryItems]);
      return;
    }
    await startBatchCollect();
  };
  const collectingInput = items.filter(item => item.status !== 'success').map(item => item.url || item.itemId).join('\n');
  const failedItems = items.filter(item => item.status === 'failed');
  const collectedCount = items.filter(item => item.status === 'success' && item.selected).length;

  return (
    <section className="mx-auto w-full max-w-[980px] pt-8 pb-10 sm:pt-14">
      <BatchStage1OverviewCard />
      <div data-testid="stage1-input-dock" className="mx-auto w-full max-w-[980px]">
        <BatchStage1InputCard
          batchInputText={isCollecting ? collectingInput : batchInputText}
          setBatchInputText={setBatchInputText}
          isCollecting={isCollecting}
          hasInputs={hasInputs}
          collectProgress={collectProgress}
          handleSmartBatchCollect={handleSmartBatchCollect}
        />
        {isCollecting && <div className="mt-4 rounded-2xl border border-slate-200 bg-white/95 p-4 dark:border-white/10 dark:bg-[#18191c]/95"><BatchProgressBar current={collectProgress.current} total={collectProgress.total} label={`正在采集 · 成功 ${collectProgress.success} 款 · 失败 ${collectProgress.failed} 款`} showSpinner /></div>}
        {!isCollecting && collectedCount > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white/95 p-4 dark:border-emerald-500/20 dark:bg-[#18191c]/95">
          <span className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><PackageCheck className="h-4 w-4 text-emerald-600" />当前批次已有 {collectedCount} 款商品，可以继续添加或返回选图。</span>
          <button type="button" onClick={onContinue} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500">继续选图与配置<ArrowRight className="h-3.5 w-3.5" /></button>
        </div>}
        {!isCollecting && failedItems.length > 0 && (
          <div role="alert" className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="min-w-0 flex-1 space-y-1">
              {failedItems.map(item => <p key={item.id} className="break-all">{item.itemId}：{item.errorMsg || '采集失败，请重试'}</p>)}
              <p>点击「采集商品」重试，或直接输入其他商品链接。</p>
            </div>
            {setItems && (
              <button
                type="button"
                onClick={() => setItems(prev => prev.filter(item => item.status !== 'failed'))}
                className="shrink-0 rounded-lg px-2.5 py-1 font-medium text-amber-800 transition-colors hover:bg-amber-500/15 dark:text-amber-200"
              >
                清除失败项
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
