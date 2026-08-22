'use client';
import {
  ArrowLeft,
  Cpu,
  Image as ImageIcon,
  Layers,
  ShoppingBag,
  Sliders,
  Sparkles,
} from 'lucide-react';
import AspectRatioSelector from '@/shared/ui/AspectRatioSelector';
import { proxyMediaUrl } from '@/lib/apiClient';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import CollapsibleSidePanel from '@/shared/ui/CollapsibleSidePanel';
import type { GenerationTask } from '@/store/useAppStore';

interface ImageGenParamPanelProps {
  hideChromeNav?: boolean;
  onBackToStep2: () => void;
  workshopMode: string;
  useReferenceImage: boolean;
  setUseReferenceImage: (v: boolean) => void;
  selectedProductImage?: { url: string } | null;
  productTitle?: string;
  sceneAnchorEnabled: boolean;
  setSceneAnchorEnabled: (v: boolean) => void;
  firstTask?: GenerationTask | null;
  availableImageModels: { id: string; name: string }[];
  selectedImageGenModel: string;
  setSelectedImageGenModel: (id: string) => void;
  selectedAspectId: string;
  setSelectedAspectId: (id: string) => void;
  selectedQuality: string;
  setSelectedQuality: (q: any) => void;
  productRole?: string | null;
}

export default function ImageGenParamPanel({
  hideChromeNav,
  onBackToStep2,
  workshopMode,
  useReferenceImage,
  setUseReferenceImage,
  selectedProductImage,
  productTitle,
  sceneAnchorEnabled,
  setSceneAnchorEnabled,
  firstTask,
  availableImageModels,
  selectedImageGenModel,
  setSelectedImageGenModel,
  selectedAspectId,
  setSelectedAspectId,
  selectedQuality,
  setSelectedQuality,
  productRole,
}: ImageGenParamPanelProps) {
  const weakProductLockModel =
    workshopMode !== 'social_face_product_swap' &&
    useReferenceImage &&
    /seedream|doubao|gemini|nano-banana|flux|midjourney|grok/i.test(selectedImageGenModel || '');

  const roleHint =
    productRole === 'worn_apparel'
      ? '服饰商品：模特须穿着商品图款式'
      : productRole === 'worn_accessory'
        ? '配饰商品：须清晰佩戴/展示商品图'
        : productRole === 'held_object'
          ? '手持商品：外观只认商品垫图'
          : productRole === 'placed_object'
            ? '静物陈设：主体只认商品垫图'
            : null;
  return (
    <CollapsibleSidePanel
      storageKey="image-gen-param-panel"
      title="生图设置"
      widthClass="w-[360px] md:w-[380px] lg:w-[400px] xl:w-[420px] 2xl:w-[440px]"
      className="overflow-y-auto p-5 space-y-6"
    >
      {/* Header Navigation */}
      {!hideChromeNav && (
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToStep2}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            title="返回提示词"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <h2 className="text-xs font-bold text-slate-900">生图设置</h2>
        </div>
      </div>
      )}
      {hideChromeNav && (
        <h2 className="text-xs font-bold text-slate-900 pb-1">生图设置</h2>
      )}

      {/* Reference Image Anchor */}
      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
          <span className="flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
            商品外观参考
          </span>
          {workshopMode !== 'social_face_product_swap' && (
          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-600 font-medium">
            <input
              type="checkbox"
              checked={useReferenceImage}
              onChange={e => setUseReferenceImage(e.target.checked)}
              className="rounded accent-indigo-600 cursor-pointer w-3.5 h-3.5"
            />
            <span>强制跟商品图</span>
          </label>
          )}
        </div>

        {selectedProductImage && (
          <div className="flex items-center gap-3">
            {normalizeImageUrlToStandardJpg(selectedProductImage.url) ? (
              <img
                src={normalizeImageUrlToStandardJpg(selectedProductImage.url)}
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.hasRetried && selectedProductImage.url) {
                    target.dataset.hasRetried = 'true';
                    target.src = proxyMediaUrl(selectedProductImage.url);
                  }
                }}
                className="w-12 h-12 rounded-xl object-cover bg-white border border-slate-200 flex-shrink-0 shadow-sm"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0 shadow-sm">
                <ShoppingBag className="w-6 h-6 text-indigo-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-800 truncate">
                {productTitle || '当前工作商品'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                {useReferenceImage ? '已锁定为生图一致性视觉锚点' : '已关闭商品垫图（不推荐）'}
              </div>
              {roleHint && (
                <div className="text-[10px] text-emerald-700 mt-0.5 font-medium">{roleHint}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {weakProductLockModel && (
        <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-900 leading-snug">
          当前模型多参考跟品能力较弱，服饰/外观一致性建议优先选用 GPT Image 系。
        </div>
      )}

      {/* 场景定桩：仅原创工坊展示 */}
      {workshopMode !== 'social_face_product_swap' && (
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                首图场景定桩
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                开启后顶栏会先「生成分镜 1」，确认后再生其余镜；后续镜只参考其空间光色
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSceneAnchorEnabled(!sceneAnchorEnabled)}
              className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                sceneAnchorEnabled !== false ? 'bg-indigo-600' : 'bg-slate-200'
              }`}
              aria-pressed={sceneAnchorEnabled !== false}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  sceneAnchorEnabled !== false ? 'translate-x-4' : ''
                }`}
              />
            </button>
          </div>
          {sceneAnchorEnabled !== false && firstTask?.status === 'SUCCESS' && firstTask?.resultUrl && (
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-emerald-50 border border-emerald-200">
              <img
                src={firstTask.resultUrl}
                alt="Scene Anchor"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.hasRetried && firstTask.resultUrl) {
                    target.dataset.hasRetried = 'true';
                    target.src = proxyMediaUrl(firstTask.resultUrl);
                  }
                }}
                className="w-11 h-11 rounded-lg object-cover bg-white border border-emerald-300 flex-shrink-0"
              />
              <p className="text-[11px] text-emerald-800 leading-snug">
                已锁定分镜 1 的主空间与光色；后续镜表情/动作仍按各镜提示词差异化。
              </p>
            </div>
          )}
        </div>
      )}

      {/* Image Generation Model Matrix */}
      <div className="space-y-2.5">
        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-indigo-600" />
          生图大模型
        </label>
        <div className="space-y-1.5 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 max-h-56 overflow-y-auto scroll-contain">
          {availableImageModels.length === 0 ? (
            <div className="px-3 py-4 text-center space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">暂无已启用的生图模型</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                请打开设置，从网关模型库拉取并启用生图模型后再继续。
              </p>
            </div>
          ) : (
          availableImageModels.map(m => {
            const isSelected = selectedImageGenModel === m.id;
            return (
              <div
                key={m.id}
                onClick={() => setSelectedImageGenModel(m.id)}
                className={`px-3.5 py-2 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-white border-indigo-300 text-indigo-900 shadow-sm font-bold ring-1 ring-indigo-500/20'
                    : 'bg-transparent border-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={isSelected ? 'text-indigo-600' : 'text-slate-400'}>
                    {getModelIcon(m.id, "w-4 h-4")}
                  </div>
                  <span className="text-xs truncate">{m.name}</span>
                </div>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-indigo-600 shadow-[0_0_6px_rgba(99,102,241,0.8)] flex-shrink-0" />
                )}
              </div>
            );
          })
          )}
        </div>
      </div>

      {/* Aspect Ratio Selector */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-pink-600" />
          图片比例
        </label>
        <AspectRatioSelector
          selectedId={selectedAspectId}
          onSelect={setSelectedAspectId}
        />
      </div>

      {/* Quality Selector (low, medium, high) */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            生图质量
          </span>
          <span className="text-[10px] font-mono font-bold text-indigo-600 uppercase bg-indigo-50 px-1.5 py-0.5 rounded">
            {selectedQuality === 'low' ? '1K' : selectedQuality === 'medium' ? '2K' : '4K'}
          </span>
        </label>
        <div className="bg-slate-100/90 p-1 rounded-2xl flex items-center gap-1 border border-slate-200/80">
          {[
            { id: 'low', label: '1K' },
            { id: 'medium', label: '2K ✦' },
            { id: 'high', label: '4K ✦' }
          ].map(q => {
            const isSelected = selectedQuality === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelectedQuality(q.id as any)}
                className={`flex-1 py-2 text-xs font-mono font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{q.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </CollapsibleSidePanel>
  );
}
