import React, { useMemo, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { BatchProductItem, MasterRecipe } from '../../model/batchTypes';
import { BatchStage1OverviewCard } from './BatchStage1OverviewCard';
import { BatchStage1InputCard } from './BatchStage1InputCard';
import { BatchStage1ItemCard } from './BatchStage1ItemCard';
import { countBatchInputLines } from '../../model/collection/batchCollect';


interface Props {
  batchInputText: string;
  setBatchInputText: (val: string) => void;
  items: BatchProductItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  isCollecting: boolean;
  collectProgress: { total: number; current: number; success: number; failed: number };
  successfulItems: BatchProductItem[];
  handleParseInput: () => BatchProductItem[];
  startBatchCollect: (itemsToCollect?: BatchProductItem[]) => Promise<void>;
  handleRemoveItem: (id: string) => void;
  onPreviewImage?: (url: string) => void;
  onNextStage: () => void;
  // 流水线生产预设 HUD 看板相关
  recipes?: MasterRecipe[];
  selectedArchId?: string;
  selectedShotCount?: number;
  selectedAspect?: string;
  selectedQuality?: string;
  selectedImageGenModel?: string;
  selectedVisionModel?: string;
  onOpenSettings?: () => void;
}

export default function BatchStage1Collect({
  batchInputText,
  setBatchInputText,
  items,
  isCollecting,
  collectProgress,
  successfulItems,
  handleParseInput,
  startBatchCollect,
  handleRemoveItem,
  onPreviewImage,
  onNextStage,
  recipes = [],
  selectedArchId = '',
  selectedShotCount = 4,
  selectedAspect = '3:4',
  selectedQuality = '2K',
  selectedImageGenModel = 'Doubao-Seedance-2.5',
  onOpenSettings = () => { },
}: Props) {
  const [isAddingProducts, setIsAddingProducts] = useState(false);

  // 一键快捷采编：若输入框有文本但尚未点击解析，点击主按钮自动完成解析并立刻启动采编
  const handleSmartBatchCollect = async () => {
    if (batchInputText.trim()) {
      const newItems = handleParseInput();
      if (newItems.length === 0 && items.every((item) => item.status !== 'failed' && item.status !== 'pending')) return;
      setIsAddingProducts(false);
      const retryItems = items.filter((item) => item.status === 'failed' || item.status === 'pending');
      await startBatchCollect([...newItems, ...retryItems]);
      return;
    }
    await startBatchCollect();
  };

  const hasInputs = Boolean(batchInputText.trim() || items.length > 0);

  // 统计已输入的有效链接/ID行数
  const parsedLineCount = useMemo(() => countBatchInputLines(batchInputText), [batchInputText]);

  // 粘贴剪贴板
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setBatchInputText(batchInputText ? `${batchInputText}\n${text}` : text);
      }
    } catch {
      // ignore
    }
  };

  // 快速示例
  const sampleDataA = `https://item.jd.com/100279945637.html\nhttps://item.jd.com/100323048782.html\n10160092696077`;

  const currentRecipeName = selectedArchId === 'auto'
    ? '自动按商品类目匹配'
    : recipes.find(recipe => recipe.id === selectedArchId)?.name;

  return (
    <div className={`w-full transition-all duration-300 flex flex-col ${
      items.length === 0 
        ? 'flex-1 justify-between gap-6 py-2 min-h-[calc(100vh-160px)]' 
        : 'min-h-[calc(100vh-140px)] justify-between space-y-6 pb-8'
    }`}>
      {items.length > 0 && !isAddingProducts && (
        <div className="fixed right-4 top-2 z-50 flex items-center gap-2 sm:right-8 xl:right-12">
          <button
            type="button"
            onClick={() => {
              setBatchInputText('');
              setIsAddingProducts(true);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 shadow-sm transition-all hover:bg-indigo-100 hover:shadow-md active:scale-98"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            添加新 SKU
          </button>
          {successfulItems.length > 0 && (
            <button
              type="button"
              disabled={isCollecting}
              onClick={onNextStage}
              title={`下一步：人工批量选图与提示词架构（${successfulItems.length} 款已就绪商品）`}
              aria-label={`下一步：人工批量选图与提示词架构（${successfulItems.length} 款已就绪商品）`}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0F172A] px-4 py-2 text-sm font-black text-white shadow-md transition-all hover:bg-black hover:shadow-xl active:scale-98 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-200"
            >
              <span>下一步</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <div className={items.length === 0 ? "w-full my-auto py-2" : "space-y-5 w-full flex-1"}>
        {/* 🌟 顶部全宽智能采编工作舱：仅在初始未采集状态展示，采集后隐藏 */}
        {items.length === 0 && (
          <div className="w-full">
            <BatchStage1OverviewCard />
          </div>
        )}

      {items.length > 0 && isAddingProducts && (
        <div className="flex items-center justify-between gap-4 border-b border-slate-200/60 px-1 pb-3 dark:border-white/10">
          <div>
            <h3 className="text-base font-black tracking-tight text-slate-900 dark:text-slate-100">添加新商品</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">当前采编清单已暂时收起，输入新的商品链接或 SKU 后会合并回清单。</p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddingProducts(false)}
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5 dark:border-white/10 dark:bg-[#18191c]"
          >
            返回清单
          </button>
        </div>
      )}

      {/* 🌟 采编清单与图库状态 (采集后成为大画幅核心主角) */}
      {items.length > 0 && !isAddingProducts && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/60 px-1 pb-2 dark:border-white/10">
            <h3 className="text-base font-black tracking-tight text-slate-900 dark:text-slate-100">采编清单与图库状态</h3>
            {(isCollecting || items.some(item => item.status === 'pending' || item.status === 'failed')) && (
              <button type="button" disabled={isCollecting} onClick={() => void startBatchCollect()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                {isCollecting ? `采集中 ${collectProgress.current}/${collectProgress.total}` : '采集待处理商品 / 重试失败项'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5 sm:gap-4">
            {items.map(item => (
              <BatchStage1ItemCard
                key={item.id}
                item={item}
                handleRemoveItem={handleRemoveItem}
                removeDisabled={isCollecting}
                onPreviewImage={onPreviewImage}
              />
            ))}
          </div>

        </div>
      )}
      </div>

      {/* 商品清单出现后，输入已完成，收起底部输入舱以让商品状态成为唯一焦点。 */}
      {(items.length === 0 || isAddingProducts) && (
        <div
          data-testid="stage1-input-dock"
          className="w-full max-w-[calc(100%-5rem)] sm:max-w-[calc(100%-6.5rem)] md:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto sticky bottom-2 z-20 px-2 sm:px-4 mt-auto"
        >
          <BatchStage1InputCard
            batchInputText={batchInputText}
            setBatchInputText={setBatchInputText}
            parsedLineCount={parsedLineCount}
            handlePasteClipboard={handlePasteClipboard}
            sampleDataA={sampleDataA}
            isCollecting={isCollecting}
            hasInputs={hasInputs}
            collectProgress={collectProgress}
            itemsCount={items.length}
            handleParseInput={handleParseInput}
            handleSmartBatchCollect={handleSmartBatchCollect}
            recipeName={currentRecipeName}
            selectedAspect={selectedAspect}
            selectedQuality={selectedQuality}
            selectedShotCount={selectedShotCount}
            selectedImageGenModel={selectedImageGenModel}
            onOpenSettings={onOpenSettings}
          />
        </div>
      )}
    </div>
  );
}
