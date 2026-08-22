'use client';
import { RefObject, useEffect, useState } from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { VISION_MODELS } from '@/lib/vision';
import { isThinkingVisionModel } from '@/lib/visionTimeouts';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { getModelProviderName } from '@/features/hub/PromptActionBar';
import { setStoredMultimodalModelId } from '@/lib/workflowModels';
import {
  BookOpen,
  Check,
  ChevronDown,
  Cpu,
  Layers,
  Loader2,
  Wand2,
} from 'lucide-react';

export interface PromptStudioAnalyzePanelProps {
  onBackToStep1: () => void;
  workshopMode: string;
  selectedClonedList: { url: string }[];
  selectedClonedCount: number;
  product: { title?: string; picUrl?: string } | null;
  effectiveImages: { url: string }[];
  anchorFaceImageUrl: string | null;
  isNoModel: boolean;
  availableVisionModels: any[];
  selectedVisionModel: string;
  setSelectedVisionModel: (id: string) => void;
  isModelDropdownOpen: boolean;
  setIsModelDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  modelDropdownRef: RefObject<HTMLDivElement | null>;
  showAdvancedSettings: boolean;
  setShowAdvancedSettings: React.Dispatch<React.SetStateAction<boolean>>;
  clonedSocialImages: { selected?: boolean; url: string }[];
  shotCount: number;
  setShotCount: (n: number) => void;
  extraRequirements: string;
  setExtraRequirements: (v: string) => void;
  onOpenPromptHistory?: () => void;
  handleGeneratePrompts: () => void;
  isAnalyzing: boolean;
  generatedPromptsLength: number;
  effectiveShotCount: number;
  stylePickerSlot?: React.ReactNode;
}

export default function PromptStudioAnalyzePanel({
  onBackToStep1,
  workshopMode,
  selectedClonedList,
  selectedClonedCount,
  product,
  effectiveImages,
  anchorFaceImageUrl,
  isNoModel,
  availableVisionModels,
  selectedVisionModel,
  setSelectedVisionModel,
  isModelDropdownOpen,
  setIsModelDropdownOpen,
  modelDropdownRef,
  showAdvancedSettings,
  setShowAdvancedSettings,
  clonedSocialImages,
  shotCount,
  setShotCount,
  extraRequirements,
  setExtraRequirements,
  onOpenPromptHistory,
  handleGeneratePrompts,
  isAnalyzing,
  generatedPromptsLength,
  effectiveShotCount,
  stylePickerSlot,
}: PromptStudioAnalyzePanelProps) {
  const [analyzeElapsedSec, setAnalyzeElapsedSec] = useState(0);

  useEffect(() => {
    if (!isAnalyzing) {
      setAnalyzeElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setAnalyzeElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  const activeVisionModelForHint =
    availableVisionModels.find(m => m.id === selectedVisionModel) ||
    availableVisionModels[0] ||
    VISION_MODELS[0];
  const analyzeWaitHint = isThinkingVisionModel(activeVisionModelForHint?.id || '')
    ? '深度思考模型通常需 1–2 分钟，请勿关闭页面'
    : '视觉分析进行中，复杂商品图可能需要 1 分钟左右';

  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-4.5">
{/* 1. Reference Assets Bar — 只读三缩略图 */}
{workshopMode === 'social_face_product_swap' ? (
  <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-2.5">
    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
      <span className="flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5 text-indigo-600" />
        <span>素材摘要</span>
      </span>
      <button
        onClick={onBackToStep1}
        className="px-2 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-[11px] text-slate-600 border border-slate-200 font-bold cursor-pointer"
      >
        重选素材
      </button>
    </div>
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1.5 flex-1 min-w-0 overflow-hidden">
        {selectedClonedList.slice(0, 4).map((img, idx) => (
          <img
            key={idx}
            src={normalizeImageUrlToStandardJpg(img.url)}
            alt=""
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-lg object-cover border-2 border-white bg-slate-100"
            title="参考图"
          />
        ))}
        {(product?.picUrl || effectiveImages[0]?.url) && (
          <img
            src={normalizeImageUrlToStandardJpg(product?.picUrl || effectiveImages[0]?.url)}
            alt=""
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-lg object-cover border-2 border-indigo-200 bg-slate-100"
            title="商品图"
          />
        )}
        {anchorFaceImageUrl && !isNoModel && (
          <img
            src={anchorFaceImageUrl}
            alt=""
            className="w-9 h-9 rounded-full object-cover border-2 border-indigo-300 bg-slate-100"
            title="正脸"
          />
        )}
      </div>
      <div className="text-[10px] text-slate-500 font-medium flex-shrink-0 text-right">
        <div>参考 {selectedClonedList.length}</div>
        <div>{isNoModel ? '纯商品' : (anchorFaceImageUrl ? '已定脸' : '换脸')}</div>
      </div>
    </div>
    {isNoModel && selectedClonedCount > 0 && (
      <div className="px-2.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-900 leading-relaxed">
        纯商品模式请勿使用人物出镜参考图，否则易穿帮。含模特时请回 Step1 切换换脸模式。
      </div>
    )}
  </div>
) : (
  <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-2.5">
    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
      <span className="flex items-center gap-1.5">
        <Layers className="w-3.5 h-3.5 text-indigo-600" />
        <span>素材摘要</span>
      </span>
      <button
        onClick={onBackToStep1}
        className="px-2 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-[11px] text-slate-600 border border-slate-200 font-bold cursor-pointer"
      >
        重选素材
      </button>
    </div>
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1.5 flex-1 min-w-0 overflow-hidden">
        {effectiveImages.slice(0, 5).map((img, idx) => (
          <img
            key={idx}
            src={normalizeImageUrlToStandardJpg(img.url)}
            alt=""
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.dataset.hasRetried && img.url) {
                target.dataset.hasRetried = 'true';
                target.src = proxyMediaUrl(img.url);
              }
            }}
            className="w-9 h-9 rounded-lg object-cover border-2 border-white bg-slate-100"
            title="商品图"
          />
        ))}
        {anchorFaceImageUrl && !isNoModel && (
          <img
            src={anchorFaceImageUrl}
            alt=""
            className="w-9 h-9 rounded-full object-cover border-2 border-indigo-300 bg-slate-100"
            title="正脸"
          />
        )}
      </div>
      <div className="text-[10px] text-slate-500 font-medium flex-shrink-0 text-right">
        <div>商品图 {effectiveImages.length}</div>
        <div>{isNoModel ? '纯商品' : (anchorFaceImageUrl ? '已定脸' : '人设模特')}</div>
      </div>
    </div>
    {product?.title && (
      <p className="text-[11px] text-slate-600 truncate font-medium">{product.title}</p>
    )}
  </div>
)}

{/* 2. 多模态大模型选择器（统一 Comfly 三分类：生图 / 生视频 / 多模态；视觉分析与分镜策划均走多模态通道）*/}
{(() => {
  const activeVisionModel = availableVisionModels.find(m => m.id === selectedVisionModel) || availableVisionModels[0] || VISION_MODELS[0];
  const activeProvider = getModelProviderName(activeVisionModel.id, activeVisionModel.name, activeVisionModel.provider);
  
  return (
    <div className="space-y-2 relative" ref={modelDropdownRef}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-purple-50 border border-purple-200/80 text-purple-600 flex items-center justify-center shadow-2xs">
            <Cpu className="w-3 h-3" />
          </div>
          <span>多模态大模型</span>
        </label>
        <span className="text-[10px] text-slate-400 font-mono">视觉分析 · 分镜策划</span>
      </div>

      {/* 主选定模型胶囊卡片 (点击展开/收起完整模型列表) */}
      <button
        type="button"
        onClick={() => setIsModelDropdownOpen(prev => !prev)}
        className="w-full p-2.5 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between gap-2.5 text-left group shadow-2xs"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
            {getModelIcon(activeVisionModel.id, "w-6 h-6")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-900 truncate">
                {activeVisionModel.shortName || activeVisionModel.name}
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 flex-shrink-0">
                {activeProvider}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 truncate mt-0.5">
              多模态视觉推理 · 4K 分镜解构
            </div>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isModelDropdownOpen ? 'rotate-180 text-indigo-600' : 'group-hover:text-slate-600'}`} />
      </button>

      {/* 下拉模型弹层 */}
      {isModelDropdownOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 p-2 rounded-2xl bg-white border border-slate-200 shadow-xl space-y-1.5 max-h-72 overflow-y-auto scroll-contain animate-fade-in">
          <div className="px-2 py-1 text-[10px] font-bold text-slate-400 flex items-center justify-between border-b border-slate-100">
            <span>切换多模态策划模型</span>
            <span>共 {availableVisionModels.length} 个模型</span>
          </div>
          <div className="space-y-1">
            {availableVisionModels.map(m => {
              const isSelected = selectedVisionModel === m.id;
              const provider = getModelProviderName(m.id, m.name, m.provider);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedVisionModel(m.id);
                    setStoredMultimodalModelId(m.id);
                    setIsModelDropdownOpen(false);
                  }}
                  className={`w-full p-2 rounded-xl text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200'
                      : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-2xs">
                      {getModelIcon(m.id, "w-5 h-5")}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{m.name}</div>
                      <div className="text-[9px] text-slate-400 truncate">{provider}</div>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
})()}

        {stylePickerSlot}
{/* 4. Shot Count Display / Selector */}
{/* 分镜数量 + 额外要求：爆款默认折叠 */}
{workshopMode === 'social_face_product_swap' ? (
  <div className="rounded-2xl border border-slate-200 overflow-hidden">
    <button
      type="button"
      onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
      className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
    >
      <span>高级设置</span>
      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} />
    </button>
    {showAdvancedSettings && (
      <div className="px-3.5 pb-3.5 space-y-3 border-t border-slate-100 pt-3">
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-700">分镜数量</span>
          <span className="font-mono text-indigo-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200 font-bold">
            已锁定 {clonedSocialImages.filter(i => i.selected).length || shotCount} 镜
          </span>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-800">额外要求（可选）</label>
          <input
            type="text"
            value={extraRequirements}
            onChange={e => setExtraRequirements(e.target.value)}
            placeholder="如：暖阳斜射、桌面摆放等"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-xs outline-none focus:bg-white focus:border-indigo-500"
          />
        </div>
        {onOpenPromptHistory && (
          <button
            type="button"
            onClick={onOpenPromptHistory}
            className="w-full py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            打开提示词库
          </button>
        )}
      </div>
    )}
  </div>
) : (
  <div className="rounded-2xl border border-slate-200 overflow-hidden">
    <button
      type="button"
      onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
      className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
    >
      <span className="flex items-center gap-2">
        <span>高级设置</span>
        <span className="font-mono text-[10px] text-slate-400 font-normal">{shotCount} 镜</span>
      </span>
      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`} />
    </button>
    {showAdvancedSettings && (
      <div className="px-3.5 pb-3.5 space-y-3 border-t border-slate-100 pt-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>分镜镜头数量</span>
            <span className="font-mono text-indigo-700 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
              {shotCount} 镜
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-2xl bg-slate-100/90 border border-slate-200/80">
            {[2, 3, 4, 6].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => setShotCount(num)}
                className={`py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center ${
                  shotCount === num
                    ? 'bg-white text-indigo-800 shadow-xs font-bold border border-slate-200'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {num} 镜
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-800">额外场景要求（可选）</label>
          <input
            type="text"
            value={extraRequirements}
            onChange={e => setExtraRequirements(e.target.value)}
            placeholder="如：暖阳斜射、桌面摆放冰美式、手持开箱等"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-xs outline-none focus:bg-white focus:border-indigo-500"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {['暖阳斜射', '桌面随手拍', '手持开箱实操', '氛围感夜景', '绿植原木点缀'].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  if (!extraRequirements) setExtraRequirements(tag);
                  else if (!extraRequirements.includes(tag)) setExtraRequirements(`${extraRequirements}，${tag}`);
                }}
                className="px-2 py-0.5 rounded-lg bg-white hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[10px] font-medium transition-colors cursor-pointer border border-slate-200/80"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
        {onOpenPromptHistory && (
          <button
            type="button"
            onClick={onOpenPromptHistory}
            className="w-full py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            打开提示词库
          </button>
        )}
      </div>
    )}
  </div>
)}

      </div>
{/* Bottom Docked Action Button */}
<div className="p-4 border-t border-slate-200/80 bg-slate-50/80 flex-shrink-0 space-y-2">
  {isAnalyzing && (
    <p className="text-[10px] text-slate-500 text-center leading-relaxed px-1">
      {analyzeWaitHint}
      {analyzeElapsedSec > 0 && (
        <span className="font-mono text-indigo-600"> · 已等待 {analyzeElapsedSec}s</span>
      )}
    </p>
  )}
  <button
    onClick={handleGeneratePrompts}
    disabled={isAnalyzing}
    className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
  >
    {isAnalyzing ? (
      <>
        <Loader2 className="w-4 h-4 animate-spin text-white" />
        <span>分析中{analyzeElapsedSec > 0 ? ` (${analyzeElapsedSec}s)` : '...'}</span>
      </>
    ) : (
      <>
        <Wand2 className="w-4 h-4 text-white" />
        <span>{generatedPromptsLength > 0 ? `重新分析 (${effectiveShotCount} 镜)` : `开始分析 (${effectiveShotCount} 镜)`}</span>
      </>
    )}
  </button>
</div>
    </>
  );
}
