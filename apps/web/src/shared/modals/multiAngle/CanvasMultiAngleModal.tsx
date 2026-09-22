import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  RotateCcw,
  ArrowUp,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import { LightboxGenConfigToolbar } from '@/shared/modals/lightbox/LightboxGenConfigToolbar';
import { useCanvasToolConfig } from '@/features/canvas/hooks/useCanvasToolConfig';

export interface MultiAngleSource {
  imageUrl?: string;
  title?: string;
}

export type MultiAnglePresetKey =
  | 'custom'
  | 'fisheye'
  | 'tilted'
  | 'front-high'
  | 'front-low'
  | 'pano-high'
  | 'back';

export type ShotScale = '全景' | '中景' | '特写';

export interface MultiAngleParams {
  preset: MultiAnglePresetKey;
  azimuth: number; // 水平环绕 0° ~ 360°
  elevation: number; // 垂直俯仰 -90° ~ 90° (0° 为中点)
  shotScale: ShotScale; // 全景 | 中景 | 特写
  promptEnabled: boolean; // 提示词开关
  prompt: string; // 提示词文本
  model?: string;
  quality?: string;
  aspectRatio?: string;
}

// 7 大视角预设定义（严格对齐用户提供的真实运行截图）
export interface PresetConfig {
  key: MultiAnglePresetKey;
  label: string;
  azimuth: number;
  elevation: number;
  shotScale: ShotScale;
  promptEnabled: boolean;
  prompt: string;
}

export const PRESET_CONFIGS: PresetConfig[] = [
  {
    key: 'custom',
    label: '自定义',
    azimuth: 0,
    elevation: 0,
    shotScale: '中景',
    promptEnabled: false,
    prompt: '',
  },
  {
    key: 'fisheye',
    label: '鱼眼视角',
    azimuth: 0,
    elevation: 30,
    shotScale: '特写',
    promptEnabled: true,
    prompt: '极度特写镜头，广角镜头，边缘带有鱼眼畸变效果',
  },
  {
    key: 'tilted',
    label: '倾斜视角',
    azimuth: 45,
    elevation: -30,
    shotScale: '中景',
    promptEnabled: true,
    prompt: 'dutch angle，tilted frame',
  },
  {
    key: 'front-high',
    label: '正面俯拍',
    azimuth: 0,
    elevation: 60,
    shotScale: '中景',
    promptEnabled: false,
    prompt: '',
  },
  {
    key: 'front-low',
    label: '正面仰拍',
    azimuth: 0,
    elevation: -30,
    shotScale: '中景',
    promptEnabled: false,
    prompt: '',
  },
  {
    key: 'pano-high',
    label: '全景俯拍',
    azimuth: 45,
    elevation: 30,
    shotScale: '全景',
    promptEnabled: false,
    prompt: '',
  },
  {
    key: 'back',
    label: '背面视角',
    azimuth: 180,
    elevation: 0,
    shotScale: '中景',
    promptEnabled: false,
    prompt: '',
  },
];

export const DEFAULT_MULTI_ANGLE_PARAMS: MultiAngleParams = {
  preset: 'custom',
  azimuth: 0,
  elevation: 0,
  shotScale: '中景',
  promptEnabled: false,
  prompt: '',
};

interface CanvasMultiAngleModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: MultiAngleSource | null;
  onSubmit?: (
    params: MultiAngleParams,
    options?: { model?: string; quality?: string; aspectRatio?: string }
  ) => void;
}

export const CanvasMultiAngleModal: React.FC<CanvasMultiAngleModalProps> = ({
  isOpen,
  onClose,
  node,
  onSubmit,
}) => {
  const { selectedModelId, selectedQuality, selectedAspectId, handleSelectModel, handleSelectQuality, handleSelectAspect } = useCanvasToolConfig();

  const [params, setParams] = useState<MultiAngleParams>(DEFAULT_MULTI_ANGLE_PARAMS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const sphereRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const dragStartAnglesRef = useRef({ azimuth: 0, elevation: 0 });

  // 弹窗开启时重置为自定义初值
  useEffect(() => {
    if (isOpen) {
      setParams(DEFAULT_MULTI_ANGLE_PARAMS);
      setIsSubmitting(false);
      setSubmitSuccess(false);
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

  // 四方位微调按钮：每次微调 15°
  const handleNudge = (type: 'up' | 'down' | 'left' | 'right') => {
    setParams((prev) => {
      let newElevation = prev.elevation;
      let newAzimuth = prev.azimuth;

      if (type === 'up') {
        newElevation = Math.min(90, prev.elevation + 15);
      } else if (type === 'down') {
        newElevation = Math.max(-90, prev.elevation - 15);
      } else if (type === 'left') {
        newAzimuth = (prev.azimuth - 15 + 360) % 360;
      } else if (type === 'right') {
        newAzimuth = (prev.azimuth + 15) % 360;
      }

      return {
        ...prev,
        preset: 'custom',
        elevation: newElevation,
        azimuth: newAzimuth,
      };
    });
  };

  // 球体鼠标拖拽旋转
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    dragStartAnglesRef.current = { azimuth: params.azimuth, elevation: params.elevation };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartPosRef.current.x;
    const dy = e.clientY - dragStartPosRef.current.y;

    // 水平拖拽 1px 映射约 1°
    const newAz = (dragStartAnglesRef.current.azimuth + Math.round(dx * 0.9) + 360) % 360;
    // 垂直向上拖拽增加仰角/俯角
    const newEl = Math.max(
      -90,
      Math.min(90, dragStartAnglesRef.current.elevation - Math.round(dy * 0.8))
    );

    setParams((prev) => ({
      ...prev,
      preset: 'custom',
      azimuth: newAz,
      elevation: newEl,
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // 提交生成
  const handleSubmit = () => {
    setIsSubmitting(true);
    const mergedParams: MultiAngleParams = {
      ...params,
      model: selectedModelId,
      quality: selectedQuality,
      aspectRatio: selectedAspectId,
    };
    if (onSubmit) {
      onSubmit(mergedParams, {
        model: selectedModelId,
        quality: selectedQuality,
        aspectRatio: selectedAspectId,
      });
    }
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitSuccess(true);
      setTimeout(() => {
        onClose();
      }, 700);
    }, 600);
  };

  // 计算摄像机在 3D 空间球上的投影百分比坐标
  const { camX, camY, isFrontCamera, isBackCamera } = useMemo(() => {
    const radAz = (params.azimuth * Math.PI) / 180;
    const radEl = (params.elevation * Math.PI) / 180;

    // 球体半径系数 (40% 半径)
    const x = 50 + Math.sin(radAz) * Math.cos(radEl) * 40;
    const y = 50 - Math.sin(radEl) * 40;
    const isFront = params.azimuth === 0 && params.elevation === 0;
    const isBack = (params.azimuth === 180 || params.azimuth === -180) && params.elevation === 0;

    return {
      camX: Math.max(10, Math.min(90, x)),
      camY: Math.max(10, Math.min(90, y)),
      isFrontCamera: isFront,
      isBackCamera: isBack,
    };
  }, [params.azimuth, params.elevation]);

  // 景别对应的 scale 缩放倍率
  const scaleMultiplier = useMemo(() => {
    if (params.shotScale === '特写') return 1.25;
    if (params.shotScale === '全景') return 0.85;
    return 1.0;
  }, [params.shotScale]);

  // 倾斜视角时的额外倾角 Roll (Z轴)
  const rollAngle = params.preset === 'tilted' ? -15 : 0;

  if (!isOpen || !node) return null;

  return (
    <div
      data-testid="multi-angle-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[640px] rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-200/90 overflow-hidden select-none"
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
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
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
        <div className="flex gap-4 p-5 pt-3">
          {/* 左侧：3D 环视球体视口容器 */}
          <div className="flex-1 flex flex-col items-center bg-zinc-50 rounded-xl border border-zinc-200/80 p-3 relative overflow-hidden">
            {/* 上微调箭头 ^ */}
            <button
              type="button"
              onClick={() => handleNudge('up')}
              aria-label="向上微调"
              title="向上俯仰微调"
              className="absolute top-2 left-1/2 -translate-x-1/2 p-1 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-200/50 rounded-md transition-colors z-20 cursor-pointer"
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            {/* 下微调箭头 v */}
            <button
              type="button"
              onClick={() => handleNudge('down')}
              aria-label="向下微调"
              title="向下俯仰微调"
              className="absolute bottom-2 left-1/2 -translate-x-1/2 p-1 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-200/50 rounded-md transition-colors z-20 cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* 左微调箭头 < */}
            <button
              type="button"
              onClick={() => handleNudge('left')}
              aria-label="向左微调"
              title="向左环绕微调"
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-200/50 rounded-md transition-colors z-20 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* 右微调箭头 > */}
            <button
              type="button"
              onClick={() => handleNudge('right')}
              aria-label="向右微调"
              title="向右环绕微调"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-200/50 rounded-md transition-colors z-20 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* 3D 空间球容器 */}
            <div
              ref={sphereRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative w-[210px] h-[210px] my-auto flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
              title="可直接在球体上拖动调整视角"
            >
              {/* 球体背景渐变微凹浅色底盘 */}
              <div className="absolute inset-0 rounded-full border border-zinc-200/90 bg-radial from-white via-zinc-100 to-zinc-200/70 shadow-inner pointer-events-none" />

              {/* 空间球经纬线 SVG */}
              <svg
                viewBox="0 0 100 100"
                className="absolute inset-0 w-full h-full pointer-events-none opacity-50"
              >
                {/* 外层大圆 */}
                <circle cx="50" cy="50" r="46" fill="none" stroke="#94a3b8" strokeWidth="0.7" />
                {/* 经线椭圆组 */}
                <ellipse cx="50" cy="50" rx="36" ry="46" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                <ellipse cx="50" cy="50" rx="22" ry="46" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                <ellipse cx="50" cy="50" rx="8" ry="46" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                {/* 纬线椭圆组 */}
                <ellipse cx="50" cy="50" rx="46" ry="36" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                <ellipse cx="50" cy="50" rx="46" ry="22" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                <ellipse cx="50" cy="50" rx="46" ry="8" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                {/* 中轴虚线 */}
                <line x1="50" y1="4" x2="50" y2="96" stroke="#64748b" strokeWidth="0.5" strokeDasharray="1.5 2" />
                <line x1="4" y1="50" x2="96" y2="50" stroke="#64748b" strokeWidth="0.5" strokeDasharray="1.5 2" />

                {/* 摄像机视锥投影线 (Camera Frustum Lines) */}
                {!isFrontCamera && !isBackCamera && (
                  <>
                    <line
                      x1={camX}
                      y1={camY}
                      x2={50}
                      y2={50}
                      stroke="#2563eb"
                      strokeWidth="1.2"
                      strokeOpacity="0.8"
                    />
                    <polygon
                      points={`${camX},${camY} 42,42 58,42`}
                      fill="#3b82f6"
                      fillOpacity="0.18"
                    />
                  </>
                )}
              </svg>

              {/* 球体中央立式素材卡片 (3D 动态旋转变化) */}
              <div
                className="relative z-10 w-[64px] h-[84px] rounded-xs overflow-hidden shadow-xl border border-zinc-200 bg-white transition-transform duration-300 pointer-events-none"
                style={{
                  transform: `perspective(400px) rotateY(${params.azimuth > 180 ? 360 - params.azimuth : -params.azimuth}deg) rotateX(${params.elevation}deg) rotateZ(${rollAngle}deg) scale(${scaleMultiplier})`,
                  boxShadow: '0 8px 18px rgba(0,0,0,0.22)',
                }}
              >
                {node.imageUrl ? (
                  <img
                    src={node.imageUrl}
                    alt={node.title || '素材卡片'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-100 text-[10px] text-zinc-500">
                    素材
                  </div>
                )}

                {/* 随角度产生自然受光明暗叠加 */}
                <div
                  className="absolute inset-0 pointer-events-none mix-blend-overlay transition-opacity duration-200"
                  style={{
                    background: `linear-gradient(${params.azimuth}deg, rgba(255,255,255,0.25) 0%, rgba(0,0,0,0.4) 100%)`,
                  }}
                />

                {/* 背面视角时卡片中央镜头靶心指示器 */}
                {isBackCamera && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                    <div className="w-5 h-5 rounded-full bg-black/60 border border-white/80 flex items-center justify-center shadow-md">
                      <div className="w-2.5 h-2.5 rounded-full border border-white/90 flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-white" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3D 摄像机指示器模型 (Camera Chassis) */}
              {!isFrontCamera && !isBackCamera && (
                <div
                  className="absolute z-20 pointer-events-none transition-all duration-200 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${camX}%`,
                    top: `${camY}%`,
                  }}
                >
                  {/* 立体黑色微型相机盒子，带镜头红点与亮边 */}
                  <div className="relative w-7 h-5 rounded-xs bg-zinc-900 border border-zinc-400/90 shadow-xl flex items-center justify-center">
                    {/* 相机微型镜头与反光点 */}
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-950 border border-zinc-600 flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-red-500 shadow-xs" />
                    </div>
                    {/* 相机顶部闪光灯小方块 */}
                    <div className="absolute -top-1 right-1 w-1.5 h-1 bg-zinc-600 rounded-2xs" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右侧：参数控制面板 */}
          <div className="w-[270px] flex flex-col gap-3.5 text-xs text-zinc-700">
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

        {/* 底部控制栏 (Footer) */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100 bg-zinc-50/80">
          {/* 重置参数 */}
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重置参数</span>
          </button>

          {/* 右侧：模型切换、清晰度与提交按钮 (按要求彻底移除算力 14 徽章，改用亮色工具栏) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <LightboxGenConfigToolbar
              theme="light"
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
              disabled={isSubmitting || submitSuccess}
              className={`w-9 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                submitSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-900 hover:bg-black text-white shadow-sm'
              }`}
              title="应用多角度效果并生成"
            >
              {submitSuccess ? (
                <Check className="w-4 h-4 text-white" />
              ) : (
                <ArrowUp className="w-4 h-4 text-white stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasMultiAngleModal;
