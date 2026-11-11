import React, { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  X,
  RotateCcw,
  Sun,
  ArrowUp,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import type { CanvasNode } from '../../store/useCanvasStore';
import { LightboxGenConfigToolbar } from '@client/shared/modals/lightbox/LightboxGenConfigToolbar';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { useCanvasToolConfig } from '@client/shared/hooks/useCanvasToolConfig';
import { useCanvasToolSubmission } from '@client/shared/hooks/useCanvasToolSubmission';
import {
  DEFAULT_LIGHTING_PARAMS,
  LIGHT_DIRECTION_COORDS,
  LIGHT_DIRECTION_COORDS_BY_VIEW,
  PRESET_LIGHT_COLORS,
  type LightingParams,
  type MainLightDirection,
} from '../../model/canvasNodeFactory';

export {
  DEFAULT_LIGHTING_PARAMS,
  LIGHT_DIRECTION_COORDS,
  LIGHT_DIRECTION_COORDS_BY_VIEW,
  PRESET_LIGHT_COLORS,
  type LightingParams,
  type MainLightDirection,
};

export function CanvasLightingPreview({ node, params, setParams }: {
  node: CanvasNode;
  params: LightingParams;
  setParams: Dispatch<SetStateAction<LightingParams>>;
}) {
  const sphereRef = useRef<HTMLDivElement>(null);
  const isDraggingLightRef = useRef(false);
  const handleSpherePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingLightRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateLightFromPointer(e);
  };

  const handleSpherePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingLightRef.current) return;
    updateLightFromPointer(e);
  };

  const handleSpherePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingLightRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const updateLightFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!sphereRef.current) return;
    const rect = sphereRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const px = e.clientX - rect.left - cx;
    const py = e.clientY - rect.top - cy;
    const radius = Math.min(cx, cy) * 0.88;
    const dist = Math.sqrt(px * px + py * py);
    let clampedX = px;
    let clampedY = py;
    if (dist > radius) {
      clampedX = (px / dist) * radius;
      clampedY = (py / dist) * radius;
    }
    const normX = Math.round(((clampedX + cx) / rect.width) * 100);
    const normY = Math.round(((clampedY + cy) / rect.height) * 100);
    setParams((prev) => ({
      ...prev,
      lightCoords: { x: normX, y: normY },
    }));
  };

  const handleSwitchViewMode = (mode: 'perspective' | 'front') => {
    setParams((prev) => ({
      ...prev,
      viewMode: mode,
      lightCoords: LIGHT_DIRECTION_COORDS_BY_VIEW[mode][prev.mainLight] || prev.lightCoords,
    }));
  };

  const sourceX = params.lightCoords.x;
  const sourceY = params.lightCoords.y;
  const targetX = 50;
  const targetY = 50;
  const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
  const perpAngle = angle + Math.PI / 2;
  const coneWidth = 22;
  const p1X = targetX + Math.cos(perpAngle) * coneWidth;
  const p1Y = targetY + Math.sin(perpAngle) * coneWidth;
  const p2X = targetX - Math.cos(perpAngle) * coneWidth;
  const p2Y = targetY - Math.sin(perpAngle) * coneWidth;
  const currentLightColorHex = params.color === 'original' ? '#ffffff' : params.color;
  const isFrontDirectLight = params.viewMode === 'front' && params.mainLight === 'front';

  return (
    <div className="w-[214px] shrink-0 flex flex-col items-center bg-[#18181b] rounded-xl border border-white/[0.06] p-3 relative overflow-hidden">
      <div className="flex items-center p-1 bg-[#222226] border border-white/[0.07] rounded-lg text-xs font-medium w-full mb-2.5 z-10">
        <button
          type="button"
          onClick={() => handleSwitchViewMode('perspective')}
          className={`flex-1 py-1 rounded-md transition-all cursor-pointer ${
            params.viewMode === 'perspective'
              ? 'bg-[#38383d] text-white shadow-xs font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          透视
        </button>
        <button
          type="button"
          onClick={() => handleSwitchViewMode('front')}
          className={`flex-1 py-1 rounded-md transition-all cursor-pointer ${
            params.viewMode === 'front'
              ? 'bg-[#38383d] text-white shadow-xs font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          正面
        </button>
      </div>

      <div
        ref={sphereRef}
        onPointerDown={handleSpherePointerDown}
        onPointerMove={handleSpherePointerMove}
        onPointerUp={handleSpherePointerUp}
        className="relative w-[184px] h-[184px] my-auto flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
        title="可直接在球体上拖动光源"
      >
        <div
          className="absolute inset-0 rounded-full border border-white/15 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 38% 35%, rgba(255,255,255,0.22) 0%, rgba(120,120,130,0.18) 45%, rgba(24,24,28,0.92) 100%)',
            boxShadow:
              'inset 0 -12px 24px rgba(0,0,0,0.65), inset 0 4px 12px rgba(255,255,255,0.12)',
          }}
        />
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none opacity-45">
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" strokeDasharray="2 2" />
          <ellipse cx="50" cy="50" rx="46" ry="24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" strokeDasharray="1.5 2" />
          <ellipse cx="50" cy="50" rx="24" ry="46" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" strokeDasharray="1.5 2" />
          <line x1="50" y1="4" x2="50" y2="96" stroke="rgba(255,255,255,0.14)" strokeWidth="0.5" strokeDasharray="2 2" />
          <line x1="4" y1="50" x2="96" y2="50" stroke="rgba(255,255,255,0.14)" strokeWidth="0.5" strokeDasharray="2 2" />
          {!isFrontDirectLight && (
            <polygon
              points={`${sourceX},${sourceY} ${p1X},${p1Y} ${p2X},${p2Y}`}
              fill={currentLightColorHex}
              fillOpacity={0.26 + (params.brightness / 100) * 0.36}
              className="transition-all duration-150"
            />
          )}
        </svg>

        {isFrontDirectLight && (
          <div
            className="absolute rounded-full pointer-events-none transition-all duration-200 -translate-x-1/2 -translate-y-1/2 z-15"
            style={{
              left: `${params.lightCoords.x}%`,
              top: `${params.lightCoords.y}%`,
              width: '124px',
              height: '124px',
              background: `radial-gradient(circle, ${currentLightColorHex}66 0%, ${currentLightColorHex}25 40%, transparent 70%)`,
              mixBlendMode: 'screen',
            }}
          />
        )}

        <div
          className="relative z-10 w-[64px] h-[80px] rounded-xs overflow-hidden shadow-xl border border-white/25 bg-[#18191c] transition-transform duration-300 pointer-events-none"
          style={{
            transform:
              params.viewMode === 'perspective'
                ? 'perspective(400px) rotateY(-22deg) rotateX(8deg)'
                : 'perspective(400px) rotateY(0deg) rotateX(0deg)',
            boxShadow: params.rimLight
              ? `0 0 14px 2px ${currentLightColorHex}80, 0 8px 16px rgba(0,0,0,0.45)`
              : '0 8px 16px rgba(0,0,0,0.4)',
          }}
        >
          {node.imageUrl ? (
            <img src={node.imageUrl} alt={node.title || '打光素材'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-[10px] text-zinc-400">素材</div>
          )}

          <div
            className="absolute inset-0 pointer-events-none mix-blend-overlay transition-opacity duration-150"
            style={{
              backgroundColor: currentLightColorHex,
              opacity: 0.15 + (params.brightness / 100) * 0.5,
            }}
          />

          <div
            className="absolute inset-0 pointer-events-none transition-all duration-150"
            style={{
              background: isFrontDirectLight
                ? `radial-gradient(circle at 50% 70%, rgba(255,255,255,${(params.brightness / 100) * 0.45}) 0%, rgba(0,0,0,${0.4 - (params.brightness / 100) * 0.25}) 100%)`
                : `linear-gradient(${
                    Math.round(angle * (180 / Math.PI)) + 90
                  }deg, rgba(255,255,255,${(params.brightness / 100) * 0.45}) 0%, rgba(0,0,0,${
                    0.55 - (params.brightness / 100) * 0.3
                  }) 100%)`,
              mixBlendMode: 'soft-light',
            }}
          />
        </div>

        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-150 pointer-events-none"
          style={{
            left: `${params.lightCoords.x}%`,
            top: `${params.lightCoords.y}%`,
          }}
        >
          <div
            className="w-4 h-4 rounded-full bg-[#111113] border-[1.5px] border-white/85 flex items-center justify-center"
            style={{
              boxShadow: `0 0 12px 2px ${currentLightColorHex}99, 0 2px 6px rgba(0,0,0,0.6)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface CanvasLightingModalProps {
  isOpen: boolean;
  inline?: boolean;
  onClose: () => void;
  node: CanvasNode | null;
  onSubmit: (
    params: LightingParams,
    options?: { model?: string; quality?: string; aspectRatio?: string }
  ) => void | Promise<void>;
}

export const CanvasLightingModal: React.FC<CanvasLightingModalProps> = ({
  isOpen,
  inline = false,
  onClose,
  node,
  onSubmit,
}) => {
  const { isDark } = useAppTheme();
  const { selectedModelId, selectedQuality, selectedAspectId, handleSelectModel, handleSelectQuality, handleSelectAspect } = useCanvasToolConfig(isOpen);

  const [params, setParams] = useState<LightingParams>(DEFAULT_LIGHTING_PARAMS);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const { isSubmitting, submitError, submit } = useCanvasToolSubmission(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setParams(DEFAULT_LIGHTING_PARAMS);
      setShowColorPicker(false);
    }
  }, [isOpen]);

  const handleSelectDirection = (dir: MainLightDirection) => {
    setParams((prev) => ({
      ...prev,
      mainLight: dir,
      lightCoords: LIGHT_DIRECTION_COORDS_BY_VIEW[prev.viewMode][dir],
    }));
  };

  const handleReset = () => {
    setParams(DEFAULT_LIGHTING_PARAMS);
  };

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

  const panelContent = (
    <div
      data-lighting-panel="true"
      className="relative w-[496px] max-w-[calc(100vw-24px)] rounded-2xl bg-[#202024] text-zinc-100 border border-white/10 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.65)] select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-medium text-zinc-200 tracking-wide">打光效果</h3>
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

      {/* 主体两栏布局 */}
      <div className="flex items-stretch gap-4">
        <CanvasLightingPreview node={node} params={params} setParams={setParams} />

        {/* 右侧：参数控制面板 */}
        <div className="flex-1 min-w-0 flex flex-col gap-3.5 text-xs text-zinc-200">
          {/* 1. 全局 / 智能模式 */}
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-200">全局</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-zinc-400 text-xs">智能模式</span>
              <input
                type="checkbox"
                role="switch"
                aria-label="智能模式开关"
                checked={params.smartMode}
                onChange={(e) => setParams((prev) => ({ ...prev, smartMode: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-8 h-4 rounded-full border border-white/20 bg-[#2a2a2e] peer-focus:outline-none peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-[#4f46e5] relative" />
            </label>
          </div>

          {/* 2. 亮度 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-zinc-300">亮度</span>
              <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <input
                type="range"
                min="0"
                max="100"
                aria-label="亮度"
                value={params.brightness}
                onChange={(e) => setParams((prev) => ({ ...prev, brightness: Number(e.target.value) }))}
                className="multi-angle-slider flex-1 cursor-pointer"
              />
              <div className="flex items-center gap-1 bg-[#252529] border border-white/10 rounded-md px-1.5 py-0.5 text-[11px] text-zinc-300 w-14 justify-center shrink-0 tabular-nums">
                <Sun className="w-3 h-3 text-zinc-400" />
                <span>{params.brightness} %</span>
              </div>
            </div>
          </div>

          {/* 3. 颜色 */}
          <div className="flex items-center gap-3 relative">
            <div className="flex items-center gap-1">
              <span className="text-zinc-300">颜色</span>
              <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="w-11 h-5 rounded border border-white/25 bg-white relative overflow-hidden shadow-xs cursor-pointer hover:border-white/50 transition-colors"
                title="点击选择光照颜色"
              >
                {params.color === 'original' ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-[120%] h-[1.5px] bg-red-500 rotate-[-22deg]" />
                  </div>
                ) : (
                  <div
                    className="w-full h-full"
                    style={{ backgroundColor: params.color }}
                  />
                )}
              </button>

              {showColorPicker && (
                <div className="absolute left-0 top-7 z-30 bg-[#202024] border border-white/10 rounded-xl p-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.65)] flex flex-col gap-2 w-48">
                  <div className="text-[11px] font-medium text-zinc-400">推荐光源色彩</div>
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
                            ? 'border-white bg-white/15 font-medium'
                            : 'border-white/10 hover:border-white/25 bg-white/5'
                        }`}
                        title={item.name}
                      >
                        {item.value === 'original' ? (
                          <div className="w-5 h-5 rounded-full bg-white relative overflow-hidden border border-white/20">
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-full h-[2px] bg-red-500 rotate-[-30deg]" />
                            </div>
                          </div>
                        ) : (
                          <div
                            className="w-5 h-5 rounded-full border border-white/20 shadow-xs"
                            style={{ backgroundColor: item.color }}
                          />
                        )}
                        <span className="text-[9px] text-zinc-300 truncate w-full text-center">
                          {item.name}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-1.5 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">自定义颜色</span>
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
          <div className="flex flex-col gap-2 pt-0.5">
            <span className="text-zinc-300">主光源</span>
            <div className="grid grid-cols-3 gap-2">
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
                    className={`h-8 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center border ${
                      isSelected
                        ? 'bg-[#38383d] text-white border-white/30 shadow-xs font-semibold'
                        : 'bg-[#252529] text-zinc-400 border-white/[0.08] hover:border-white/20 hover:text-zinc-200'
                    }`}
                  >
                    {dir.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. 轮廓光 */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="flex items-center gap-1">
              <span className="text-zinc-300">轮廓光</span>
              <HelpCircle className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
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
              <div className="w-8 h-4 rounded-full border border-white/20 bg-[#2a2a2e] peer-focus:outline-none peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-[#4f46e5] relative" />
            </label>
          </div>
        </div>
      </div>

      {submitError && <p role="alert" className="pt-2.5 text-xs text-rose-400">{submitError}</p>}

      {/* 底部控制栏 (Footer) */}
      <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>重置参数</span>
        </button>

        {inline ? (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-7 h-7 rounded-lg bg-[#d4d4d8] hover:bg-white text-zinc-900 flex items-center justify-center shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              title="应用打光效果并生成"
              aria-label="应用打光效果并生成"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.2]" />
              )}
            </button>
          </div>
        ) : (
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
              className="w-9 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 bg-white hover:bg-zinc-200 text-zinc-900 shadow-sm disabled:opacity-50"
              title="应用打光效果并生成"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (inline) {
    return panelContent;
  }

  return (
    <div
      data-testid="lighting-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {panelContent}
    </div>
  );
};

export default CanvasLightingModal;
