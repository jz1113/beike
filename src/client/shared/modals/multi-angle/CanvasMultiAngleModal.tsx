import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  ArrowUp,
  Loader2,
} from 'lucide-react';
import { LightboxGenConfigToolbar } from '@client/shared/modals/lightbox/LightboxGenConfigToolbar';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { useCanvasToolConfig } from '@client/shared/hooks/useCanvasToolConfig';
import { useCanvasToolSubmission } from '@client/shared/hooks/useCanvasToolSubmission';

import {
  DEFAULT_MULTI_ANGLE_PARAMS,
  PRESET_CONFIGS,
  type MultiAngleParams,
  type MultiAnglePresetKey,
  type MultiAngleSource,
  type ShotScale,
} from './multiAnglePresets';
import { MultiAngleViewport } from './MultiAngleViewport';

export {
  DEFAULT_MULTI_ANGLE_PARAMS,
  PRESET_CONFIGS,
  type MultiAngleParams,
  type MultiAnglePresetKey,
  type MultiAngleSource,
  type PresetConfig,
  type ShotScale,
} from './multiAnglePresets';

interface CanvasMultiAngleModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: MultiAngleSource | null;
  onSubmit: (
    params: MultiAngleParams,
    options?: { model?: string; quality?: string; aspectRatio?: string }
  ) => void | Promise<void>;
}

export const CanvasMultiAngleModal: React.FC<CanvasMultiAngleModalProps> = ({
  isOpen,
  onClose,
  node,
  onSubmit,
}) => {
  const { isDark } = useAppTheme();
  const { selectedModelId, selectedQuality, selectedAspectId, handleSelectModel, handleSelectQuality, handleSelectAspect } = useCanvasToolConfig(isOpen);

  const [params, setParams] = useState<MultiAngleParams>(DEFAULT_MULTI_ANGLE_PARAMS);
  const { isSubmitting, submitError, submit } = useCanvasToolSubmission(isOpen, onClose);

  // 弹窗开启时重置为自定义初值
  useEffect(() => {
    if (isOpen) {
      setParams(DEFAULT_MULTI_ANGLE_PARAMS);
    }
  }, [isOpen]);

  // 点击预设 Tab 切换
  const handleSelectPreset = (presetKey: MultiAnglePresetKey) => {
    const config = PRESET_CONFIGS.find((p) => p.key === presetKey);
    if (!config) return;

    setParams({
      preset: config.key,
      azimuth: config.azimuth,
      elevation: config.elevation,
      shotScale: config.shotScale,
      promptEnabled: config.promptEnabled,
      prompt: config.prompt,
    });
  };

  // 重置参数
  const handleReset = () => {
    setParams(DEFAULT_MULTI_ANGLE_PARAMS);
  };

  // 提交生成
  const handleSubmit = () => {
    const mergedParams: MultiAngleParams = {
      ...params,
      model: selectedModelId,
      quality: selectedQuality,
      aspectRatio: selectedAspectId,
    };
    void submit(() => onSubmit(mergedParams, {
      model: selectedModelId,
      quality: selectedQuality,
      aspectRatio: selectedAspectId,
    }));
  };

  if (!isOpen || !node) return null;

  return (
    <div
      data-testid="multi-angle-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[720px] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-200/90 overflow-hidden select-none dark:bg-[#18191c]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 tracking-wide">多角度编辑器</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 顶部 7 大预设选项 Tab 栏 */}
        <div className="px-5 pt-3 pb-1">
          <div className="flex flex-wrap items-center gap-1.5 py-0.5">
            {PRESET_CONFIGS.map((p) => {
              const isSelected = params.preset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleSelectPreset(p.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs font-semibold'
                      : 'bg-zinc-100 text-zinc-600 border-zinc-200/70 hover:border-zinc-300 hover:text-zinc-900'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 主体两栏布局 */}
        <div className="flex flex-col sm:flex-row gap-4 p-5 pt-3">
          <MultiAngleViewport node={node} params={params} setParams={setParams} />

          {/* 右侧：参数控制面板 */}
          <div className="w-full sm:w-[270px] shrink-0 flex flex-col gap-3.5 text-xs text-zinc-700">
            {/* 1. 水平环绕 (0° ~ 360°) */}
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-zinc-800 w-16">水平环绕</span>
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 flex items-center">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    aria-label="水平环绕"
                    value={params.azimuth}
                    onChange={(e) => {
                      setParams((prev) => ({
                        ...prev,
                        preset: 'custom',
                        azimuth: Number(e.target.value),
                      }));
                    }}
                    className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900 relative z-10"
                  />
                  {/* 左侧蓝色高亮条 */}
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-sky-500 rounded-l-lg pointer-events-none"
                    style={{ width: `${(params.azimuth / 360) * 100}%` }}
                  />
                </div>
                <span className="text-zinc-700 text-right w-9 font-mono">
                  {params.azimuth}°
                </span>
              </div>
            </div>

            {/* 2. 垂直俯仰 (-90° ~ 90°，以 0° 为正中心对称高亮) */}
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-zinc-800 w-16">垂直俯仰</span>
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 flex items-center">
                  <input
                    type="range"
                    min="-90"
                    max="90"
                    step="1"
                    aria-label="垂直俯仰"
                    value={params.elevation}
                    onChange={(e) => {
                      setParams((prev) => ({
                        ...prev,
                        preset: 'custom',
                        elevation: Number(e.target.value),
                      }));
                    }}
                    className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900 relative z-10"
                  />
                  {/* 中心双向蓝色高亮条 */}
                  {params.elevation > 0 && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-sky-500 pointer-events-none"
                      style={{
                        left: '50%',
                        width: `${(params.elevation / 180) * 100}%`,
                      }}
                    />
                  )}
                  {params.elevation < 0 && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-sky-500 pointer-events-none"
                      style={{
                        left: `${50 - (Math.abs(params.elevation) / 180) * 100}%`,
                        width: `${(Math.abs(params.elevation) / 180) * 100}%`,
                      }}
                    />
                  )}
                </div>
                <span className="text-zinc-700 text-right w-9 font-mono">
                  {params.elevation}°
                </span>
              </div>
            </div>

            {/* 3. 景别缩放 (全景 / 中景 / 特写) */}
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-zinc-800 w-16">景别缩放</span>
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 flex items-center">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="1"
                    aria-label="景别缩放"
                    value={params.shotScale === '全景' ? 0 : params.shotScale === '中景' ? 1 : 2}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const map: Record<number, ShotScale> = {
                        0: '全景',
                        1: '中景',
                        2: '特写',
                      };
                      setParams((prev) => ({
                        ...prev,
                        preset: 'custom',
                        shotScale: map[val] || '中景',
                      }));
                    }}
                    className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900 relative z-10"
                  />
                  {/* 景别蓝色高亮条：以中景(50%)为中心基准的双向高亮 */}
                  {params.shotScale === '全景' && (
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 w-1/2 bg-sky-500 rounded-l-lg pointer-events-none"
                    />
                  )}
                  {params.shotScale === '特写' && (
                    <div
                      className="absolute left-1/2 top-1/2 -translate-y-1/2 h-1.5 w-1/2 bg-sky-500 rounded-r-lg pointer-events-none"
                    />
                  )}
                </div>
                <span className="text-zinc-700 text-right w-9">
                  {params.shotScale}
                </span>
              </div>
            </div>

            {/* 4. 提示词 (开关与展开输入框) */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-800">提示词</span>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="提示词开关"
                    checked={params.promptEnabled}
                    onChange={(e) =>
                      setParams((prev) => ({
                        ...prev,
                        promptEnabled: e.target.checked,
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-zinc-900 relative" />
                </label>
              </div>

              {/* 展开的提示词输入文本域 */}
              {params.promptEnabled && (
                <textarea
                  rows={3}
                  value={params.prompt}
                  onChange={(e) =>
                    setParams((prev) => ({
                      ...prev,
                      prompt: e.target.value,
                    }))
                  }
                  placeholder="输入视角相关的镜头描述或提示词..."
                  aria-label="提示词输入框"
                  className="soft-textarea w-full p-2.5 text-zinc-800 text-xs resize-none placeholder:text-zinc-400 animate-in fade-in duration-150"
                />
              )}
            </div>
          </div>
        </div>

        {submitError && <p role="alert" className="px-5 pb-3 text-xs text-rose-600 dark:text-rose-400">{submitError}</p>}
        {/* 底部控制栏 (Footer) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-zinc-100 bg-zinc-50/80 dark:border-white/10 dark:bg-[#18181b]">
          {/* 重置参数 */}
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer dark:text-zinc-400 dark:hover:text-white"
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
              className="w-9 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 bg-zinc-900 hover:bg-black text-white shadow-sm disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              title="应用多角度效果并生成"
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

export default CanvasMultiAngleModal;
