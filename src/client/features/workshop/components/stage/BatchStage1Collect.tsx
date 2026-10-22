import { BatchProductItem } from '../../model/batchTypes';
import { BatchStage1OverviewCard } from './BatchStage1OverviewCard';
import { BatchStage1InputCard } from './BatchStage1InputCard';

interface Props {
  batchInputText: string;
  setBatchInputText: (val: string) => void;
  items: BatchProductItem[];
  isCollecting: boolean;
  collectProgress: { total: number; current: number; success: number; failed: number };
  handleParseInput: () => BatchProductItem[];
  startBatchCollect: (itemsToCollect?: BatchProductItem[], forceRefresh?: boolean) => Promise<void>;
}

export default function BatchStage1Collect({
  batchInputText, setBatchInputText, items, isCollecting,
  collectProgress, handleParseInput, startBatchCollect,
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

  return (
    <div className="flex w-full flex-1 flex-col justify-start gap-7 pt-8 pb-8 sm:pt-[clamp(3rem,12vh,9rem)]">
      <BatchStage1OverviewCard />
      <div data-testid="stage1-input-dock" className="mx-auto w-full max-w-[900px]">
        <BatchStage1InputCard
          batchInputText={isCollecting ? collectingInput : batchInputText}
          setBatchInputText={setBatchInputText}
          isCollecting={isCollecting}
          hasInputs={hasInputs}
          collectProgress={collectProgress}
          handleSmartBatchCollect={handleSmartBatchCollect}
        />
        {!isCollecting && failedItems.length > 0 && <div role="alert" className="mt-4 space-y-1 px-2 text-xs leading-6 text-amber-700 dark:text-amber-300">
          {failedItems.map(item => <p key={item.id}>{item.itemId}：{item.errorMsg || '采集失败，请重试'}</p>)}
          <p>点击箭头重试，或输入其他商品链接。</p>
        </div>}
      </div>
    </div>
  );
}
