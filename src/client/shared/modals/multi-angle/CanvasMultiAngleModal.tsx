import React, { useState, useEffect } from 'react';
import {
  ArrowUp,
  X,
  RotateCcw,
  Loader2,
} from 'lucide-react';
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
  inline?: boolean;
  onClose: () => void;
  node: MultiAngleSource | null;
  onSubmit: (
    params: MultiAngleParams,
    options?: { model?: string; quality?: string; aspectRatio?: string }
  ) => void | Promise<void>;
}

export const CanvasMultiAngleModal: React.FC<CanvasMultiAngleModalProps> = ({
  isOpen,
  inline = false,
  onClose,
  node,
  onSubmit,
}) => {
  const { selectedModelId, selectedQuality, selectedAspectId } = useCanvasToolConfig(isOpen);

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

  const panelContent = (
    <div
      data-multi-angle-panel="true"
      className="relative w-[476px] max-w-[calc(100vw-24px)] rounded-2xl bg-[#1e1e22] text-zinc-100 border border-white/10 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.65)] select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-medium text-zinc-200 tracking-wide">多角度编辑器</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭弹窗"
          className="p-0.5 rounded-md text-zinc-400 hover:text-white transition-colors cursor-pointer"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 顶部 7 大预设选项 Tab 栏 */}
      <div className="grid grid-cols-7 gap-1.5 mb-3.5">
        {PRESET_CONFIGS.map((p) => {
          const isSelected = params.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handleSelectPreset(p.key)}
              className={`py-1.5 px-1 rounded-md text-[11px] font-medium whitespace-nowrap text-center transition-colors cursor-pointer border ${
                isSelected
                  ? 'bg-[#38383d] text-white border-white/15'
                  : 'bg-[#252529] text-zinc-400 border-white/[0.07] hover:text-zinc-200 hover:bg-[#2d2d32]'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* 主体两栏布局 */}
      <div className="flex items-start gap-4">
        <MultiAngleViewport node={node} params={params} setParams={setParams} />

        {/* 右侧：参数控制面板 */}
        <div className="flex-1 min-w-0 flex flex-col gap-4 pt-1 text-xs">
          {/* 1. 水平环绕 (0° ~ 360°) */}
          <div className="flex items-center gap-3">
            <span className="text-zinc-400 w-12 shrink-0">水平环绕</span>
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
              className="multi-angle-slider flex-1 cursor-pointer"
            />
            <span className="text-zinc-200 text-right w-8 shrink-0 tabular-nums">
              {params.azimuth}°
            </span>
          </div>

          {/* 2. 垂直俯仰 (-90° ~ 90°) */}
          <div className="flex items-center gap-3">
            <span className="text-zinc-400 w-12 shrink-0">垂直俯仰</span>
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
              className="multi-angle-slider flex-1 cursor-pointer"
            />
            <span className="text-zinc-200 text-right w-8 shrink-0 tabular-nums">
              {params.elevation}°
            </span>
          </div>

          {/* 3. 景别缩放 (全景 / 中景 / 特写) */}
          <div className="flex items-center gap-3">
            <span className="text-zinc-400 w-12 shrink-0">景别缩放</span>
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
              className="multi-angle-slider flex-1 cursor-pointer"
            />
            <span className="text-zinc-200 text-right w-8 shrink-0">
              {params.shotScale}
            </span>
          </div>

          {/* 4. 提示词 (开关与展开输入框) */}
          <div className="flex flex-col gap-2 pt-0.5">
            <div className="flex items-center gap-2.5">
              <span className="text-zinc-400">提示词</span>
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
                <div className="w-7 h-4 rounded-full border border-white/25 bg-[#252529] peer-focus:outline-none peer-checked:after:translate-x-3 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 peer-checked:after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-[#3f3f46] relative" />
              </label>
            </div>

            {params.promptEnabled && (
              <textarea
                rows={2}
                value={params.prompt}
                onChange={(e) =>
                  setParams((prev) => ({
                    ...prev,
                    prompt: e.target.value,
                  }))
                }
                placeholder="输入视角相关的镜头描述或提示词..."
                aria-label="提示词输入框"
                className="w-full rounded-lg border border-white/10 bg-[#252529] p-2 text-zinc-200 text-xs resize-none placeholder:text-zinc-500 outline-none focus:border-white/25"
              />
            )}
          </div>
        </div>
      </div>

      {submitError && <p role="alert" className="pt-2.5 text-xs text-rose-400">{submitError}</p>}

      {/* 底部控制栏 (Footer) */}
      <div className="mt-3.5 flex items-center justify-between">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>重置参数</span>
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-900 shadow-sm transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-50 cursor-pointer"
          title="应用多角度效果并生成"
          aria-label="应用多角度效果并生成"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-800" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );

  if (inline) {
    return panelContent;
  }

  return (
    <div
      data-testid="multi-angle-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {panelContent}
    </div>
  );
};

export default CanvasMultiAngleModal;
