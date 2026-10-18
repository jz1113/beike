import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Sun,
  ArrowUp,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import type { CanvasNode } from '../store/useCanvasStore';
import { LightboxGenConfigToolbar } from '@client/shared/modals/lightbox/LightboxGenConfigToolbar';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { useCanvasToolConfig } from '@client/shared/hooks/useCanvasToolConfig';
import { useCanvasToolSubmission } from '@client/shared/hooks/useCanvasToolSubmission';

import { DEFAULT_LIGHTING_PARAMS, LIGHT_DIRECTION_COORDS_BY_VIEW, PRESET_LIGHT_COLORS, type LightingParams, type MainLightDirection } from '../model/lighting';
import { CanvasLightingPreview } from './CanvasLightingPreview';
export { DEFAULT_LIGHTING_PARAMS, LIGHT_DIRECTION_COORDS, LIGHT_DIRECTION_COORDS_BY_VIEW, PRESET_LIGHT_COLORS, type LightingParams, type MainLightDirection } from '../model/lighting';

interface CanvasLightingModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: CanvasNode | null;
  onSubmit: (
    params: LightingParams,
    options?: { model?: string; quality?: string; aspectRatio?: string }
  ) => void | Promise<void>;
}

export const CanvasLightingModal: React.FC<CanvasLightingModalProps> = ({
  isOpen,
  onClose,
  node,
  onSubmit,
}) => {
  const { isDark } = useAppTheme();
  const { selectedModelId, selectedQuality, selectedAspectId, handleSelectModel, handleSelectQuality, handleSelectAspect } = useCanvasToolConfig(isOpen);

  const [params, setParams] = useState<LightingParams>(DEFAULT_LIGHTING_PARAMS);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const { isSubmitting, submitError, submit } = useCanvasToolSubmission(isOpen, onClose);


  // 当弹窗打开时重置状态并同步全局模型与画质设置
  useEffect(() => {
    if (isOpen) {
      setParams(DEFAULT_LIGHTING_PARAMS);
      setShowColorPicker(false);
    }
  }, [isOpen]);

  // 选择主光源方向预设 (结合当前视角)
  const handleSelectDirection = (dir: MainLightDirection) => {
    setParams((prev) => ({
      ...prev,
      mainLight: dir,
      lightCoords: LIGHT_DIRECTION_COORDS_BY_VIEW[prev.viewMode][dir],
    }));
  };

  // 重置所有参数
  const handleReset = () => {
    setParams(DEFAULT_LIGHTING_PARAMS);
  };

  // 提交生成
  const handleSubmit = () => {
    const finalParams: LightingParams = {
      ...params,
      model: selectedModelId,
      quality: selectedQuality,
      aspectRatio: selectedAspectId,
    };
    void submit(() => onSubmit(finalParams, {
      model: selectedModelId,
      quality: selectedQuality,
      aspectRatio: selectedAspectId,
    }));
  };

  if (!isOpen || !node) return null;

  return (
    <div
      data-testid="lighting-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[560px] rounded-2xl bg-white dark:bg-[#1B1B1E] text-zinc-900 dark:text-[#EDEDED] shadow-2xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] border border-zinc-200/90 dark:border-white/10 overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-zinc-100 dark:border-white/10">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-wide">打光效果</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体两栏布局 */}
        <div className="flex gap-4 p-5">
          <CanvasLightingPreview node={node} params={params} setParams={setParams} />

          {/* 右侧：参数控制面板 */}
          <div className="w-[260px] flex flex-col gap-3.5 text-xs text-zinc-700 dark:text-zinc-300">
            {/* 1. 全局 / 智能模式 */}
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-800 dark:text-white">全局</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">智能模式</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="智能模式开关"
                  checked={params.smartMode}
                  onChange={(e) => setParams((prev) => ({ ...prev, smartMode: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-zinc-200 dark:bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-zinc-900 dark:peer-checked:bg-indigo-600 relative" />
              </label>
            </div>

            {/* 2. 亮度 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <span className="font-medium text-zinc-800">亮度</span>
                <HelpCircle className="w-3 h-3 text-zinc-400 hover:text-zinc-600 cursor-help" />
              </div>
              <div className="flex items-center gap-2 flex-1 justify-end">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={params.brightness}
                  onChange={(e) => setParams((prev) => ({ ...prev, brightness: Number(e.target.value) }))}
                  className="w-24 h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900"
                />
                <div className="flex items-center gap-1 bg-zinc-100 border border-zinc-200 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-700 w-14 justify-center">
                  <Sun className="w-3 h-3 text-zinc-500" />
                  <span>{params.brightness} %</span>
                </div>
              </div>
            </div>

            {/* 3. 颜色 */}
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-1">
                <span className="font-medium text-zinc-800">颜色</span>
                <HelpCircle className="w-3 h-3 text-zinc-400 hover:text-zinc-600 cursor-help" />
              </div>

              {/* 颜色指示色块 */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="w-12 h-6 rounded border border-zinc-300 dark:border-white/20 bg-white dark:bg-[#151518] relative overflow-hidden shadow-xs cursor-pointer hover:border-zinc-400 dark:hover:border-white/40 transition-colors"
                  title="点击选择光照颜色"
                >
                  {params.color === 'original' ? (
                    // 原色斜红线
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-full h-[2px] bg-red-600 rotate-[-25deg] shadow-xs" />
                    </div>
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{ backgroundColor: params.color }}
                    />
                  )}
                </button>

                {/* 颜色选择预设浮层 */}
                {showColorPicker && (
                  <div className="absolute right-0 top-8 z-30 bg-white dark:bg-[#202024] border border-zinc-200 dark:border-white/10 rounded-xl p-2.5 shadow-xl dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)] flex flex-col gap-2 w-48">
                    <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">推荐光源色彩</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {PRESET_LIGHT_COLORS.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => {
                            setParams((prev) => ({ ...prev, color: item.value }));
                            setShowColorPicker(false);
                          }}
                          className={`flex flex-col items-center gap-1 p-1 rounded-lg border transition-all cursor-pointer ${
                            params.color === item.value
                              ? 'border-zinc-900 dark:border-white bg-zinc-100 dark:bg-white/15 font-medium'
                              : 'border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 bg-zinc-50/60 dark:bg-white/5'
                          }`}
                          title={item.name}
                        >
                          {item.value === 'original' ? (
                            <div className="w-5 h-5 rounded-full bg-white dark:bg-[#1B1B1E] relative overflow-hidden border border-zinc-300 dark:border-white/20">
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-full h-[2px] bg-red-600 rotate-[-30deg]" />
                              </div>
                            </div>
                          ) : (
                            <div
                              className="w-5 h-5 rounded-full border border-zinc-300 dark:border-white/20 shadow-xs"
                              style={{ backgroundColor: item.color }}
                            />
                          )}
                          <span className="text-[9px] text-zinc-700 dark:text-zinc-300 truncate w-full text-center">
                            {item.name}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* 自定义拾色器 */}
                    <div className="pt-1.5 border-t border-zinc-100 flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500">自定义颜色</span>
                      <input
                        type="color"
                        value={params.color === 'original' ? '#ffffff' : params.color}
                        onChange={(e) => setParams((prev) => ({ ...prev, color: e.target.value }))}
                        className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 4. 主光源 (6 个方位按钮组) */}
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="font-medium text-zinc-800">主光源</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { key: 'left', label: '左侧' },
                    { key: 'top', label: '顶部' },
                    { key: 'right', label: '右侧' },
                    { key: 'front', label: '前方' },
                    { key: 'bottom', label: '底部' },
                    { key: 'back', label: '后方' },
                  ] as const
                ).map((dir) => {
                  const isSelected = params.mainLight === dir.key;
                  return (
                    <button
                      key={dir.key}
                      type="button"
                      onClick={() => handleSelectDirection(dir.key)}
                      className={`h-7 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center border ${
                        isSelected
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs font-semibold'
                          : 'bg-zinc-100 text-zinc-600 border-zinc-200/70 hover:border-zinc-300 hover:text-zinc-900'
                      }`}
                    >
                      {dir.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. 轮廓光 */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1">
                <span className="font-medium text-zinc-800 dark:text-white">轮廓光</span>
                <HelpCircle className="w-3 h-3 text-zinc-400 dark:text-slate-500 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-help" />
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="轮廓光开关"
                  checked={params.rimLight}
                  onChange={(e) => setParams((prev) => ({ ...prev, rimLight: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-zinc-200 dark:bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-zinc-900 dark:peer-checked:bg-indigo-600 relative" />
              </label>
            </div>
          </div>
        </div>

        {submitError && <p role="alert" className="px-5 pb-3 text-xs text-rose-600 dark:text-rose-400">{submitError}</p>}
        {/* 底部控制栏 (Footer) */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100 dark:border-white/10 bg-zinc-50/80 dark:bg-[#18181b]">
          {/* 重置参数 */}
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重置参数</span>
          </button>

          {/* 右侧：模型切换、清晰度与提交按钮 (按要求彻底移除算力 14 徽章，改用亮色工具栏) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <LightboxGenConfigToolbar
              theme={isDark ? 'dark' : 'light'}
              selectedModelId={selectedModelId}
              onSelectModel={handleSelectModel}
              selectedQuality={selectedQuality}
              onSelectQuality={handleSelectQuality}
              selectedAspectId={selectedAspectId}
              onSelectAspect={handleSelectAspect}
            />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-9 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 bg-zinc-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-200 text-white dark:text-zinc-900 shadow-sm disabled:opacity-50"
              title="应用打光效果并生成"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasLightingModal;
