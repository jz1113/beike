import { useLightboxImageModels } from './useLightboxImageModels';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { getModelIcon } from '../../ui/ModelIcons';
import '@beike/domain/workflowModels';
import { getModelProviderName } from '@/features/home/utils/modelDisplayHelpers';

export interface LightboxGenConfigToolbarProps {
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  selectedQuality: '1K' | '2K' | '4K';
  onSelectQuality: (quality: '1K' | '2K' | '4K') => void;
  selectedAspectId: string;
  onSelectAspect: (aspectId: string) => void;
  hideAspect?: boolean;
  className?: string;
  theme?: 'light' | 'dark';
}

export const ASPECT_RATIOS = [
  { id: 'smart', label: '智能' },
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' },
  { id: '4:3', label: '4:3' },
  { id: '9:16', label: '9:16' },
  { id: '16:9', label: '16:9' },
  { id: '3:2', label: '3:2' },
  { id: '2:3', label: '2:3' },
] as const;

export const LightboxGenConfigToolbar: React.FC<LightboxGenConfigToolbarProps> = ({
  selectedModelId,
  onSelectModel,
  selectedQuality,
  onSelectQuality,
  selectedAspectId,
  onSelectAspect,
  hideAspect = false,
  className = '',
  theme = 'light',
}) => {
  const isDark = theme === 'dark';

  const availableImageModels = useLightboxImageModels();

  // 下拉菜单显示控制
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState<boolean>(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const sizeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setShowModelDropdown(false);
      }
      if (
        sizeDropdownRef.current &&
        !sizeDropdownRef.current.contains(e.target as Node)
      ) {
        setShowSizeDropdown(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const activeModelObj = useMemo(() => {
    return (
      availableImageModels.find((m) => m.id === selectedModelId) || {
        id: selectedModelId,
        name: selectedModelId || '生图模型',
        provider: 'OpenAI',
      }
    );
  }, [availableImageModels, selectedModelId]);

  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 shrink-0 ${className}`}>
      {/* 1. 模型选择下拉框 */}
      <div className="relative" ref={modelDropdownRef}>
        <button
          type="button"
          onClick={() => {
            setShowModelDropdown((prev) => !prev);
            setShowSizeDropdown(false);
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer border ${
            isDark
              ? showModelDropdown
                ? 'bg-zinc-800 border-zinc-500 text-white shadow-xs'
                : 'bg-zinc-800/80 hover:bg-zinc-800 border-zinc-700/60 text-zinc-200'
              : showModelDropdown
                ? 'bg-slate-100 border-slate-300 text-slate-950 shadow-2xs'
                : 'bg-slate-100/80 hover:bg-slate-100 border-slate-200/60 text-slate-700'
          }`}
          title="点击切换生图模型"
        >
          <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
            {getModelIcon(selectedModelId, 'w-3.5 h-3.5')}
          </div>
          <span className="truncate max-w-[85px] sm:max-w-[120px] inline-block font-semibold">
            {activeModelObj.name}
          </span>
          <ChevronDown className="w-3 h-3 opacity-60 shrink-0 ml-0.5" />
        </button>

        {/* 模型下拉菜单 (向上弹出) */}
        {showModelDropdown && (
          <div
            className={`absolute left-0 sm:left-auto sm:right-0 bottom-full mb-2 w-64 sm:w-72 rounded-2xl border shadow-2xl p-2.5 z-50 animate-fade-in origin-bottom space-y-1.5 text-left ${
              isDark
                ? 'bg-[#1e1f22] border-zinc-700/90 text-zinc-200'
                : 'bg-white border-slate-200/90 text-slate-800'
            }`}
          >
            <div
              className={`px-2 py-1 text-[11px] font-mono border-b pb-1.5 flex items-center justify-between ${
                isDark
                  ? 'text-zinc-400 border-zinc-800'
                  : 'text-slate-400 border-slate-100'
              }`}
            >
              <span>生图模型配置</span>
              <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                {availableImageModels.length} 个模型可用
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
              {availableImageModels.map((m) => {
                const isSelected = selectedModelId === m.id;
                const provider = getModelProviderName(m.id, m.name, m.provider);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(m.id);
                      setShowModelDropdown(false);
                    }}
                    className={`w-full text-left p-2 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer group ${
                      isDark
                        ? isSelected
                          ? 'bg-zinc-800 border border-zinc-700 text-white font-semibold shadow-xs'
                          : 'hover:bg-zinc-800/60 text-zinc-300'
                        : isSelected
                          ? 'bg-slate-50 border border-slate-200 text-slate-900 font-semibold shadow-2xs'
                          : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 p-0.5 group-hover:scale-105 transition-transform border ${
                          isDark
                            ? 'bg-zinc-800/80 border-zinc-700/60'
                            : 'bg-slate-50 border-slate-100'
                        }`}
                      >
                        {getModelIcon(m.id, 'w-4 h-4')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span
                            className={`truncate text-[11px] font-bold ${
                              isDark ? 'text-zinc-100' : 'text-slate-900'
                            }`}
                          >
                            {m.name}
                          </span>
                        </div>
                        <span
                          className={`text-[9.5px] font-mono ${
                            isDark ? 'text-zinc-400' : 'text-slate-400'
                          }`}
                        >
                          {provider}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <Check
                        className={`w-3.5 h-3.5 stroke-[2.5] shrink-0 ml-1.5 ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. 分辨率与尺寸选择下拉框 */}
      <div className="relative" ref={sizeDropdownRef}>
        <button
          type="button"
          onClick={() => {
            setShowSizeDropdown((prev) => !prev);
            setShowModelDropdown(false);
          }}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer border ${
            isDark
              ? showSizeDropdown
                ? 'bg-zinc-800 border-zinc-500 text-white shadow-xs'
                : 'bg-zinc-800/80 hover:bg-zinc-800 border-zinc-700/60 text-zinc-200'
              : showSizeDropdown
                ? 'bg-slate-100 border-slate-300 text-slate-950 shadow-2xs'
                : 'bg-slate-100/80 hover:bg-slate-100 border-slate-200/60 text-slate-700'
          }`}
          title="点击切换尺寸与分辨率"
        >
          <span className={`font-mono font-bold ${isDark ? 'text-zinc-100' : 'text-slate-800'}`}>
            {selectedQuality}
          </span>
          {!hideAspect && selectedAspectId && selectedAspectId !== 'smart' && (
            <span
              className={`text-[10px] font-mono ${
                isDark ? 'text-zinc-400' : 'text-slate-500'
              }`}
            >
              · {selectedAspectId}
            </span>
          )}
          <ChevronDown className="w-3 h-3 opacity-60 shrink-0 ml-0.5" />
        </button>

        {/* 分辨率与尺寸下拉菜单 (向上弹出) */}
        {showSizeDropdown && (
          <div
            className={`absolute right-0 bottom-full mb-2 w-64 rounded-2xl border shadow-2xl p-3 z-50 animate-fade-in origin-bottom space-y-3 text-left ${
              isDark
                ? 'bg-[#1e1f22] border-zinc-700/90 text-zinc-200'
                : 'bg-white border-slate-200/90 text-slate-800'
            }`}
          >
            {/* 清晰度 / 画质 */}
            <div className="space-y-1.5">
              <div
                className={`text-[11px] font-bold flex items-center justify-between ${
                  isDark ? 'text-zinc-200' : 'text-slate-700'
                }`}
              >
                <span>清晰度 / 分辨率</span>
                <span
                  className={`text-[10px] font-normal ${
                    isDark ? 'text-zinc-400' : 'text-slate-400'
                  }`}
                >
                  画质档位
                </span>
              </div>
              <div
                className={`grid grid-cols-3 gap-1.5 p-1 rounded-xl ${
                  isDark ? 'bg-zinc-900/90 border border-zinc-800/80' : 'bg-slate-100/80'
                }`}
              >
                {(['1K', '2K', '4K'] as const).map((q) => {
                  const isSelected = selectedQuality === q;
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onSelectQuality(q)}
                      className={`py-1 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer text-center ${
                        isDark
                          ? isSelected
                            ? 'bg-zinc-700 text-white shadow-xs'
                            : 'text-zinc-400 hover:text-zinc-200'
                          : isSelected
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {q}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 尺寸 / 比例 */}
            {!hideAspect && (
              <div className="space-y-1.5">
                <div
                  className={`text-[11px] font-bold flex items-center justify-between ${
                    isDark ? 'text-zinc-200' : 'text-slate-700'
                  }`}
                >
                  <span>输出尺寸比例</span>
                  <span
                    className={`text-[10px] font-normal ${
                      isDark ? 'text-zinc-400' : 'text-slate-400'
                    }`}
                  >
                    长宽比
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {ASPECT_RATIOS.map((ratio) => {
                    const isSelected = selectedAspectId === ratio.id;
                    return (
                      <button
                        key={ratio.id}
                        type="button"
                        onClick={() => {
                          onSelectAspect(ratio.id);
                          setShowSizeDropdown(false);
                        }}
                        className={`py-1 px-1.5 rounded-lg text-[11px] font-mono font-medium transition-all text-center cursor-pointer ${
                          isDark
                            ? isSelected
                              ? 'bg-white text-zinc-950 font-bold shadow-xs'
                              : 'bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/40 text-zinc-300'
                            : isSelected
                              ? 'bg-slate-900 text-white font-bold shadow-xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {ratio.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
