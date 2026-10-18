import {
  Sparkles,
  ArrowUp,
  Square,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';
import type { VideoSalesCategory, VideoSalesStyleType } from '@shared/domain/video-sales';
import type { VideoSalesStudioState } from '../hooks/useVideoSalesStudio';
import { ProductImageManager } from './ProductImageManager';
import { StudioModelCapsule } from '@client/shared/ui/StudioModelCapsule';
import {
  CATEGORIES,
  STYLE_OPTIONS,
} from './ProductSetupPanelData';

interface Props {
  state: VideoSalesStudioState;
  updateState: (patch: Partial<VideoSalesStudioState>) => void;
  isAnalyzing: boolean;
  isGeneratingScript: boolean;
  error: string | null;
  onAnalyze: () => void;
  onGenerate: () => void;
  onUseExample?: () => void;
}

const TEMPLATE_PRESETS = [
  { name: '4层加厚纸巾', category: 'home' as const, points: '4层加厚湿水不破，无荧光剂，擦拭无碎屑，可作湿巾使用' },
  { name: '降噪无线耳机', category: 'tech' as const, points: '45dB深度降噪，空间音频无感延迟，单次续航40小时' },
  { name: '玻色因紧致面霜', category: 'beauty' as const, points: '30%高浓度玻色因，淡化细纹抗老修护，轻盈奶霜质地' },
];

export function ProductSetupPanel({
  state,
  updateState,
  isAnalyzing,
  isGeneratingScript,
  error,
  onAnalyze,
  onGenerate,
  onUseExample,
}: Props) {
  const isBusy = isAnalyzing || isGeneratingScript;

  return (
    <div className="space-y-6 max-w-[980px] mx-auto py-2 text-center select-none">
      {/* 居中 Hero 区域（对齐图2形式） */}
      <div>
        <h1 className="text-3xl font-black tracking-[-0.045em] text-slate-950 dark:text-white sm:text-[40px]">
          上传商品，一键生成带货短视频
        </h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          上传商品图与核心卖点，由系统同步的多模态视觉与运镜模型自动解析特征、编排爆款 AIDA 分镜脚本并合成成片。
        </p>
      </div>

      {/* 模型选择胶囊区（核心整改：直接调用系统已同步的 Chat 与 Video 模型） */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
        <StudioModelCapsule
          modality="chat"
          label="分析"
          value={state.selectedChatModel || ''}
          onChange={(modelId) => updateState({ selectedChatModel: modelId })}
        />
        <StudioModelCapsule
          modality="image"
          label="画面"
          value={state.selectedImageModel || ''}
          onChange={(modelId) => updateState({ selectedImageModel: modelId })}
        />
        <StudioModelCapsule
          modality="video"
          label="视频"
          value={state.selectedVideoModel || ''}
          onChange={(modelId) => updateState({ selectedVideoModel: modelId })}
        />
        <StudioModelCapsule
          modality="voice"
          label="配音"
          value={state.selectedVoiceModel || ''}
          onChange={(modelId) => updateState({ selectedVoiceModel: modelId })}
        />

        {/* 风格切换胶囊 */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#1C1C20]/80 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs">
          <span className="text-slate-400 dark:text-slate-500">带货风格:</span>
          <select
            value={state.styleType}
            onChange={(e) => updateState({ styleType: e.target.value as VideoSalesStyleType })}
            className="bg-transparent border-0 outline-none text-xs font-semibold cursor-pointer text-slate-800 dark:text-slate-100"
          >
            {STYLE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} className="dark:bg-[#18181C]">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 快捷商品范例 */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1 font-medium">
          <Sparkles className="h-3 w-3 text-amber-500" /> 填入参考商品:
        </span>
        {TEMPLATE_PRESETS.map((tmpl) => (
          <button
            key={tmpl.name}
            type="button"
            onClick={() => {
              updateState({
                productName: tmpl.name,
                category: tmpl.category,
                sellingPoints: tmpl.points,
              });
            }}
            className="rounded-full border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-[#1B1B1E] px-3 py-1 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all font-medium"
          >
            {tmpl.name}
          </button>
        ))}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 沉浸式输入卡片（图2风格） */}
      <section className="relative min-h-[300px] overflow-hidden rounded-[32px] border-2 border-dashed border-slate-300 dark:border-white/10 bg-white/80 dark:bg-[#1B1B1E]/80 text-left transition hover:border-indigo-300 dark:hover:border-indigo-400/50 hover:bg-white dark:hover:bg-[#1B1B1E] p-6 sm:p-8 shadow-[0_28px_80px_-50px_rgba(15,23,42,.45)]">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* 左侧：商品图管理 */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-500" /> 商品参考图 ({state.productImages.length})
              </span>
              {state.analysis && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> 已完成视觉解构
                </span>
              )}
            </div>
            <ProductImageManager
              productImages={state.productImages}
              isAnalyzing={isAnalyzing}
              onAnalyze={onAnalyze}
              onUpdateImages={(images) => updateState({ productImages: images })}
            />
          </div>

          {/* 右侧：商品基础信息与卖点 */}
          <div className="md:col-span-7 flex flex-col justify-between h-full space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  商品名称
                </label>
                <input
                  type="text"
                  placeholder="输入商品名称，如：德宝湿水不破纸巾 4层加厚"
                  value={state.productName}
                  onChange={(e) => updateState({ productName: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                  核心卖点与亮点说明
                </label>
                <textarea
                  rows={4}
                  placeholder="在此输入商品核心卖点、价格优惠或使用场景（例如：4层加厚湿水不破，适合婴儿或居家使用，限时9.9特惠）..."
                  value={state.sellingPoints}
                  onChange={(e) => updateState({ sellingPoints: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 dark:text-white resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* 卡片底部控制条与圆形大按钮 */}
            <div className="pt-3 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400">品类:</span>
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => updateState({ category: c.id as VideoSalesCategory })}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all ${
                        state.category === c.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                {isBusy ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 dark:bg-white px-5 py-2 text-xs font-bold text-white dark:text-slate-950 shadow-md">
                    <Square className="h-3 w-3 animate-spin" />
                    <span>{isAnalyzing ? '分析视觉中…' : '策划脚本中…'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                  {onUseExample && <button type="button" onClick={onUseExample} className="rounded-full px-3 py-1 text-xs font-semibold text-slate-500">用示例脚本</button>}
                  <button
                    type="button"
                    onClick={onGenerate}
                    disabled={!state.productName.trim()}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 dark:bg-white text-white dark:text-slate-950 shadow-md hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    title="立即生成分镜脚本与视频"
                  >
                    <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
