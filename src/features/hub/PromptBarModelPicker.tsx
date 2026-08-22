'use client';
import { RefObject } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { clampVideoDuration } from '@/lib/video';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import {
  getModelProviderName,
  getModelAccurateDescription,
  getModelBadgeName,
} from './modelDisplayHelpers';

interface ModelLike {
  id: string;
  name: string;
  provider?: string;
  badge?: string;
  description?: string;
  desc?: string;
  isPrimary?: boolean;
  isVip?: boolean;
}

interface Props {
  isUp: boolean;
  hubGenMode: 'image' | 'video';
  showModelDropdown: boolean;
  setShowModelDropdown: (v: boolean) => void;
  modelDropdownRef: RefObject<HTMLDivElement | null>;
  activeVideoModelObj: ModelLike;
  activeImageModelObj: ModelLike;
  availableVideoModels: ModelLike[];
  availableImageModels: ModelLike[];
  quickVideoModel: string;
  quickModel: string;
  quickVideoDuration: number;
  setQuickVideoModel: (id: string) => void;
  setQuickVideoDuration: (n: number) => void;
  setQuickModel: (id: string) => void;
}

export default function PromptBarModelPicker({
  isUp,
  hubGenMode,
  showModelDropdown,
  setShowModelDropdown,
  modelDropdownRef,
  activeVideoModelObj,
  activeImageModelObj,
  availableVideoModels,
  availableImageModels,
  quickVideoModel,
  quickModel,
  quickVideoDuration,
  setQuickVideoModel,
  setQuickVideoDuration,
  setQuickModel,
}: Props) {
  return (
    <div className="relative" ref={modelDropdownRef}>
      <button
        type="button"
        onClick={() => setShowModelDropdown(!showModelDropdown)}
        className={`${compactPill} px-3 sm:px-5 rounded-2xl font-semibold flex items-center gap-1.5 sm:gap-2.5 border transition-all cursor-pointer ${
          showModelDropdown
            ? 'bg-slate-50 text-slate-950 border-slate-300 shadow-2xs'
            : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-2xs'
        }`}
      >
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {getModelIcon(hubGenMode === 'video' ? activeVideoModelObj.id : activeImageModelObj.id, "w-5 h-5")}
        </div>
        <span className="truncate max-w-[80px] sm:max-w-[150px] lg:max-w-[200px] hidden sm:inline">
          {hubGenMode === 'video' ? activeVideoModelObj.name : activeImageModelObj.name}
        </span>
        <span className="text-xs text-cyan-500 font-bold">✦</span>
        <ChevronDown className="w-4 h-4 opacity-60" />
      </button>

      {/* 模型选择弹窗 (视频模型 vs 图片模型) */}
      {showModelDropdown && (
        <div className={`absolute left-0 ${isUp ? 'bottom-full mb-3 origin-bottom' : 'top-full mt-2 origin-top'} w-88 sm:w-96 rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-3.5 z-50 animate-fade-in space-y-1.5 text-left`}>
          <div className="px-2 py-1 text-xs text-slate-400 font-mono flex items-center justify-between border-b border-slate-100 pb-2 mb-1">
            <span>{hubGenMode === 'video' ? '旗舰视频大模型' : '高保真生图引擎'}</span>
            <span className="font-bold text-slate-700">
              {hubGenMode === 'video'
                ? getModelProviderName(activeVideoModelObj.id, activeVideoModelObj.name, activeVideoModelObj.provider)
                : getModelProviderName(activeImageModelObj.id, activeImageModelObj.name, activeImageModelObj.provider)}
            </span>
          </div>

          {/* 视频模型列表 */}
          {hubGenMode === 'video' ? (
            <div className="space-y-1.5 max-h-[min(20rem,calc(100dvh-240px))] overflow-y-auto scroll-contain pr-1">
              {availableVideoModels.map(m => {
                const isSelected = quickVideoModel === m.id;
                const providerName = getModelProviderName(m.id, m.name, m.provider);
                const badgeName = getModelBadgeName(m.id, m.name, m.badge);
                const desc = getModelAccurateDescription(m.id, m.name, m.description || m.desc);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setQuickVideoModel(m.id);
                      const snapped = clampVideoDuration(m.id, quickVideoDuration);
                      setQuickVideoDuration(snapped);
                      setShowModelDropdown(false);
                    }}
                    className={`w-full text-left p-3 rounded-2xl text-xs flex items-center justify-between transition-all cursor-pointer group ${
                      isSelected
                        ? 'bg-slate-50 border border-slate-300 text-slate-900 shadow-xs'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5 p-1 group-hover:scale-105 transition-transform">
                        {getModelIcon(m.id, "w-6 h-6")}
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-xs text-slate-900">{m.name}</span>
                          {m.isPrimary && <span className="text-cyan-500 font-bold text-[11px]">✦</span>}
                          <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold">
                            {providerName}
                          </span>
                          {badgeName && (
                            <span className="px-1.5 py-0.2 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 text-[9px] font-bold">
                              {badgeName}
                            </span>
                          )}
                          {m.isVip && (
                            <span className="px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">
                              VIP
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug font-normal">
                          {desc}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-slate-900 stroke-[2.5] flex-shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : availableImageModels.length === 0 ? (
            <div className="px-4 py-6 text-center space-y-2">
              <p className="text-xs font-semibold text-slate-700">暂无已启用的生图模型</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                请打开设置 → 服务接口配置 → 点击「获取网关模型库」，拉取并勾选需要的生图模型。
              </p>
            </div>
          ) : (
            /* 图片模型列表 */
            <div className="space-y-1.5 max-h-[min(20rem,calc(100dvh-240px))] overflow-y-auto scroll-contain pr-1">
              {availableImageModels.map(m => {
                const isSelected = quickModel === m.id;
                const providerName = getModelProviderName(m.id, m.name, m.provider);
                const badgeName = getModelBadgeName(m.id, m.name, m.badge);
                const desc = getModelAccurateDescription(m.id, m.name, m.description || m.desc);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setQuickModel(m.id);
                      setShowModelDropdown(false);
                    }}
                    className={`w-full text-left p-3 rounded-2xl text-xs flex items-center justify-between transition-all cursor-pointer group ${
                      isSelected
                        ? 'bg-slate-50 border border-slate-300 text-slate-900 shadow-xs'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5 p-1 group-hover:scale-105 transition-transform">
                        {getModelIcon(m.id, "w-6 h-6")}
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-xs text-slate-900">{m.name}</span>
                          {m.isPrimary && <span className="text-cyan-500 font-bold text-[11px]">✦</span>}
                          <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold">
                            {providerName}
                          </span>
                          {badgeName && (
                            <span className="px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">
                              {badgeName}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug font-normal">
                          {desc}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-slate-900 stroke-[2.5] flex-shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
