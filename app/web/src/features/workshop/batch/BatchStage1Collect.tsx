import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { BatchProductItem, MasterRecipe } from './batchTypes';
import { BatchStage1OverviewCard } from './components/BatchStage1OverviewCard';
import { BatchStage1InputCard } from './components/BatchStage1InputCard';
import { BatchStage1ItemCard } from './components/BatchStage1ItemCard';
import { useSafeTimeout } from '@/lib/useSafeTimeout';


interface Props {
  batchMode: 'original' | 'replication';
  batchInputText: string;
  setBatchInputText: (val: string) => void;
  items: BatchProductItem[];
  setItems: React.Dispatch<React.SetStateAction<BatchProductItem[]>>;
  isCollecting: boolean;
  collectProgress: { total: number; current: number; success: number; failed: number };
  successfulItems: BatchProductItem[];
  handleParseInput: () => void;
  startBatchCollect: () => Promise<void>;
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
  hasHumanPersona?: boolean;
  onOpenSettings?: () => void;
}

export default function BatchStage1Collect({
  batchMode,
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
  hasHumanPersona = false,
  onOpenSettings = () => { },
}: Props) {
  const { setSafeTimeout } = useSafeTimeout();
  // 一键快捷采编：若输入框有文本但尚未点击解析，点击主按钮自动完成解析并立刻启动采编
  const handleSmartBatchCollect = async () => {
    if (items.length === 0 && batchInputText.trim()) {
      handleParseInput();
      setSafeTimeout(() => {
        void startBatchCollect();
      }, 100);
      return;
    }
    await startBatchCollect();
  };

  const hasInputs = Boolean(batchInputText.trim() || items.length > 0);

  // 统计已输入的有效链接/ID行数
  const parsedLineCount = useMemo(() => {
    return batchInputText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean).length;
  }, [batchInputText]);

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

  const currentRecipe = recipes.find(r => r.id === selectedArchId) || recipes[0];

  return (
    <div className={`w-full transition-all duration-300 flex flex-col ${
      items.length === 0 
        ? 'flex-1 justify-between gap-6 py-2 min-h-[calc(100vh-160px)]' 
        : 'min-h-[calc(100vh-140px)] justify-between space-y-6 pb-8'
    }`}>
      <div className={items.length === 0 ? "w-full my-auto py-2" : "space-y-5 w-full flex-1"}>
        {/* 🌟 顶部全宽智能采编工作舱：仅在初始未采集状态展示，采集后隐藏 */}
        {items.length === 0 && (
          <div className="w-full">
            <BatchStage1OverviewCard
              batchInputText={batchInputText}
              setBatchInputText={setBatchInputText}
              parsedLineCount={parsedLineCount}
              handlePasteClipboard={handlePasteClipboard}
              sampleDataA={sampleDataA}
              itemsCount={items.length}
            />
          </div>
        )}

      {/* 🌟 采编清单与图库状态 (采集后成为大画幅核心主角) */}
      {items.length > 0 && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="px-1 pb-1 border-b border-slate-200/60">
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              采编清单与图库状态
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5 sm:gap-4">
            {items.map(item => (
              <BatchStage1ItemCard
                key={item.id}
                item={item}
                handleRemoveItem={handleRemoveItem}
                onPreviewImage={onPreviewImage}
              />
            ))}
          </div>

          {successfulItems.length > 0 && (
            <div className="flex justify-end pt-4 pb-2">
              <button
                type="button"
                onClick={onNextStage}
                className="px-8 py-3.5 rounded-2xl text-sm font-black bg-[#0F172A] hover:bg-black text-white shadow-md hover:shadow-xl flex items-center gap-2.5 cursor-pointer active:scale-98 transition-all"
              >
                <span>
                  {batchMode === 'original' 
                    ? `下一步：人工批量选图与提示词架构 (${successfulItems.length} 款已就绪商品)`
                    : `下一步：批量采集对标链接 (${successfulItems.length} 款已就绪商品)`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
      </div>

      {/* 🌟 智能输入舱 (常驻屏幕最底部，居中收缩避让 a 助手，提供高质感沉浸式采编体验) */}
      <div 
        data-testid="stage1-input-dock"
        className={`w-full max-w-[calc(100%-5rem)] sm:max-w-[calc(100%-6.5rem)] md:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto sticky bottom-2 z-20 px-2 sm:px-4 ${
          items.length === 0 ? "mt-auto" : "pt-4"
        }`}
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
          recipeName={currentRecipe?.name}
          selectedAspect={selectedAspect}
          selectedQuality={selectedQuality}
          selectedShotCount={selectedShotCount}
          selectedImageGenModel={selectedImageGenModel}
          hasHumanPersona={hasHumanPersona}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </div>
  );
}
