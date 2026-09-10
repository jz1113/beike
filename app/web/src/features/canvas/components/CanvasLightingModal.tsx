import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Sun,
  ArrowUp,
  HelpCircle,
  Check,
} from 'lucide-react';
import type { CanvasNode } from '../store/useCanvasStore';
import { LightboxGenConfigToolbar } from '@/shared/modals/lightbox/LightboxGenConfigToolbar';
import { useCanvasToolConfig } from '../hooks/useCanvasToolConfig';

export type MainLightDirection = 'left' | 'top' | 'right' | 'front' | 'bottom' | 'back';

export interface LightingParams {
  viewMode: 'perspective' | 'front';
  smartMode: boolean;
  brightness: number; // 0 - 100
  color: string; // 'original' | hex
  mainLight: MainLightDirection;
  rimLight: boolean;
  lightCoords: { x: number; y: number }; // normalized 0 - 100
  model?: string;
  quality?: string;
  aspectRatio?: string;
}

// 分视图的光源预设坐标 (透视视角 vs 正面视角)
export const LIGHT_DIRECTION_COORDS_BY_VIEW: Record<'perspective' | 'front', Record<MainLightDirection, { x: number; y: number }>> = {
  perspective: {
    left: { x: 14, y: 50 },
    top: { x: 50, y: 15 },
    right: { x: 86, y: 50 },
    front: { x: 22, y: 70 }, // 透视视角下偏左前侧
    bottom: { x: 50, y: 86 },
    back: { x: 74, y: 32 },
  },
  front: {
    left: { x: 14, y: 50 },
    top: { x: 50, y: 14 },
    right: { x: 86, y: 50 },
    front: { x: 50, y: 64 }, // 正面视角下落在卡片正中下部（如截图所示）
    bottom: { x: 50, y: 86 },
    back: { x: 50, y: 38 },
  },
};

export const DEFAULT_LIGHTING_PARAMS: LightingParams = {
  viewMode: 'perspective',
  smartMode: false,
  brightness: 50,
  color: 'original',
  mainLight: 'front',
  rimLight: false,
  lightCoords: { x: 22, y: 70 }, // 默认透视视角的前方位置
};

// 兼容向后导出的单层预设坐标（使用透视模式）
export const LIGHT_DIRECTION_COORDS = LIGHT_DIRECTION_COORDS_BY_VIEW.perspective;

// 常用推荐光色预设
export const PRESET_LIGHT_COLORS = [
  { name: '原色白光', value: 'original', color: '#ffffff' },
  { name: '暖阳暖光', value: '#ffd199', color: '#ffd199' },
  { name: '黄昏晚霞', value: '#ff884d', color: '#ff884d' },
  { name: '冷调月光', value: '#99d6ff', color: '#99d6ff' },
  { name: '赛博霓虹', value: '#d966ff', color: '#d966ff' },
  { name: '清新青翠', value: '#70e0a5', color: '#70e0a5' },
];

interface CanvasLightingModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: CanvasNode | null;
  onSubmit?: (
    params: LightingParams,
    options?: { model?: string; quality?: string; aspectRatio?: string }
  ) => void;
}

export const CanvasLightingModal: React.FC<CanvasLightingModalProps> = ({
  isOpen,
  onClose,
  node,
  onSubmit,
}) => {
  const { selectedModelId, selectedQuality, selectedAspectId, handleSelectModel, handleSelectQuality, handleSelectAspect } = useCanvasToolConfig(isOpen);

  const [params, setParams] = useState<LightingParams>(DEFAULT_LIGHTING_PARAMS);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const sphereRef = useRef<HTMLDivElement>(null);
  const isDraggingLightRef = useRef(false);

  // 当弹窗打开时重置状态并同步全局模型与画质设置
  useEffect(() => {
    if (isOpen) {
      setParams(DEFAULT_LIGHTING_PARAMS);
      setShowColorPicker(false);
      setIsSubmitting(false);
      setSubmitSuccess(false);

    }
  }, [isOpen, selectedModelId, selectedQuality, selectedAspectId]);

  // 处理在空间球上直接拖拽光源位置
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

    // 限制在球体半径内 (略留边距)
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

  // 切换视图视角 (透视 / 正面)，自动联动更新当前预设光源坐标
  const handleSwitchViewMode = (mode: 'perspective' | 'front') => {
    setParams((prev) => ({
      ...prev,
      viewMode: mode,
      lightCoords: LIGHT_DIRECTION_COORDS_BY_VIEW[mode][prev.mainLight] || prev.lightCoords,
    }));
  };

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
    setIsSubmitting(true);
    const finalParams: LightingParams = {
      ...params,
      model: selectedModelId,
      quality: selectedQuality,
      aspectRatio: selectedAspectId,
    };
    if (onSubmit) {
      onSubmit(finalParams, {
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

  if (!isOpen || !node) return null;

  // 计算聚光光束连接点（从光源点指向球体中心卡片）
  const sourceX = params.lightCoords.x;
  const sourceY = params.lightCoords.y;
  // 卡片中心坐标
  const targetX = 50;
  const targetY = 50;

  // 算出光束四边形顶点（发射出圆锥扩散光）
  const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
  const perpAngle = angle + Math.PI / 2;
  const coneWidth = 24; // 卡片处光晕扩散宽度
  const p1X = targetX + Math.cos(perpAngle) * coneWidth;
  const p1Y = targetY + Math.sin(perpAngle) * coneWidth;
  const p2X = targetX - Math.cos(perpAngle) * coneWidth;
  const p2Y = targetY - Math.sin(perpAngle) * coneWidth;

  const currentLightColorHex =
    params.color === 'original'
      ? '#ffffff'
      : params.color;

  // 是否属于正前方直射光源（正面视图且主光为前方，或光源在中心卡片区域内）
  const isFrontDirectLight =
    params.viewMode === 'front' && params.mainLight === 'front';

  return (
    <div
      data-testid="lighting-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[560px] rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-200/90 overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 tracking-wide">打光效果</h3>
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

        {/* 主体两栏布局 */}
        <div className="flex gap-4 p-5">
          {/* 左侧：3D 打光空间球预览视口 */}
          <div className="flex-1 flex flex-col items-center bg-zinc-50 rounded-xl border border-zinc-200/80 p-3 relative overflow-hidden">
            {/* 顶部视图分段控制器 (透视 / 正面) */}
            <div className="flex items-center p-0.5 bg-zinc-100 border border-zinc-200/70 rounded-lg text-xs font-medium w-fit mb-2 z-10">
              <button
                type="button"
                onClick={() => handleSwitchViewMode('perspective')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  params.viewMode === 'perspective'
                    ? 'bg-zinc-900 text-white shadow-xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                透视
              </button>
              <button
                type="button"
                onClick={() => handleSwitchViewMode('front')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  params.viewMode === 'front'
                    ? 'bg-zinc-900 text-white shadow-xs font-semibold'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                正面
              </button>
            </div>

            {/* 3D 空间球容器 */}
            <div
              ref={sphereRef}
              onPointerDown={handleSpherePointerDown}
              onPointerMove={handleSpherePointerMove}
              onPointerUp={handleSpherePointerUp}
              className="relative w-[210px] h-[210px] my-auto flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
              title="可直接在球体上拖动光源"
            >
              {/* 空间球背景经纬与渐变环 (纯白浅灰微凹质感) */}
              <div className="absolute inset-0 rounded-full border border-zinc-200/90 bg-radial from-white via-zinc-100 to-zinc-200/70 shadow-inner pointer-events-none" />

              {/* 经纬网格线 SVG */}
              <svg
                viewBox="0 0 100 100"
                className="absolute inset-0 w-full h-full pointer-events-none opacity-55"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                />
                {/* 经线椭圆 */}
                <ellipse
                  cx="50"
                  cy="50"
                  rx="46"
                  ry="24"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="0.6"
                  strokeDasharray="1.5 2"
                />
                <ellipse
                  cx="50"
                  cy="50"
                  rx="24"
                  ry="46"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="0.6"
                  strokeDasharray="1.5 2"
                />
                {/* 中轴虚线 */}
                <line x1="50" y1="4" x2="50" y2="96" stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="4" y1="50" x2="96" y2="50" stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" />

                {/* 聚光圆锥光束 (Spotlight Cone) */}
                {!isFrontDirectLight && (
                  <polygon
                    points={`${sourceX},${sourceY} ${p1X},${p1Y} ${p2X},${p2Y}`}
                    fill={currentLightColorHex}
                    fillOpacity={0.22 + (params.brightness / 100) * 0.35}
                    className="transition-all duration-150"
                  />
                )}
              </svg>

              {/* 正面直射柔和扩散光晕 */}
              {isFrontDirectLight && (
                <div
                  className="absolute rounded-full pointer-events-none transition-all duration-200 -translate-x-1/2 -translate-y-1/2 z-15"
                  style={{
                    left: `${params.lightCoords.x}%`,
                    top: `${params.lightCoords.y}%`,
                    width: '130px',
                    height: '130px',
                    background: `radial-gradient(circle, ${currentLightColorHex}66 0%, ${currentLightColorHex}25 40%, transparent 70%)`,
                    mixBlendMode: 'multiply',
                  }}
                />
              )}

              {/* 球体中央立式素材卡片 */}
              <div
                className="relative z-10 w-[70px] h-[90px] rounded-xs overflow-hidden shadow-xl border border-zinc-200 bg-white transition-transform duration-300 pointer-events-none"
                style={{
                  transform:
                    params.viewMode === 'perspective'
                      ? 'perspective(400px) rotateY(-22deg) rotateX(8deg)'
                      : 'perspective(400px) rotateY(0deg) rotateX(0deg)',
                  boxShadow: params.rimLight
                    ? `0 0 14px 2px ${currentLightColorHex}80, 0 8px 16px rgba(0,0,0,0.22)`
                    : '0 8px 16px rgba(0,0,0,0.18)',
                }}
              >
                {node.imageUrl ? (
                  <img
                    src={node.imageUrl}
                    alt={node.title || '打光素材'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-100 text-[10px] text-zinc-500">
                    素材
                  </div>
                )}

                {/* 动态光照受光层 */}
                <div
                  className="absolute inset-0 pointer-events-none mix-blend-overlay transition-opacity duration-150"
                  style={{
                    backgroundColor: currentLightColorHex,
                    opacity: 0.15 + (params.brightness / 100) * 0.5,
                  }}
                />

                {/* 动态阴影/高光渐变 */}
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

              {/* 球面光源控制圆点 */}
              <div
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-150 pointer-events-none"
                style={{
                  left: `${params.lightCoords.x}%`,
                  top: `${params.lightCoords.y}%`,
                }}
              >
                <div
                  className="w-5 h-5 rounded-full bg-white border-2 border-zinc-800 shadow-md flex items-center justify-center transition-transform scale-100 hover:scale-110"
                  style={{
                    boxShadow: `0 0 12px 2px ${currentLightColorHex}88, 0 3px 8px rgba(0,0,0,0.25)`,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: currentLightColorHex === '#ffffff' ? '#18181b' : currentLightColorHex,
                      boxShadow: `0 0 4px ${currentLightColorHex}`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：参数控制面板 */}
          <div className="w-[260px] flex flex-col gap-3.5 text-xs text-zinc-700">
            {/* 1. 全局 / 智能模式 */}
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-800">全局</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-zinc-500 text-[11px]">智能模式</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="智能模式开关"
                  checked={params.smartMode}
                  onChange={(e) => setParams((prev) => ({ ...prev, smartMode: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-zinc-900 relative" />
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
                  className="w-12 h-6 rounded border border-zinc-300 bg-white relative overflow-hidden shadow-xs cursor-pointer hover:border-zinc-400 transition-colors"
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
                  <div className="absolute right-0 top-8 z-30 bg-white border border-zinc-200 rounded-xl p-2.5 shadow-xl flex flex-col gap-2 w-48">
                    <div className="text-[11px] font-medium text-zinc-500">推荐光源色彩</div>
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
                              ? 'border-zinc-900 bg-zinc-100 font-medium'
                              : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/60'
                          }`}
                          title={item.name}
                        >
                          {item.value === 'original' ? (
                            <div className="w-5 h-5 rounded-full bg-white relative overflow-hidden border border-zinc-300">
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-full h-[2px] bg-red-600 rotate-[-30deg]" />
                              </div>
                            </div>
                          ) : (
                            <div
                              className="w-5 h-5 rounded-full border border-zinc-300 shadow-xs"
                              style={{ backgroundColor: item.color }}
                            />
                          )}
                          <span className="text-[9px] text-zinc-700 truncate w-full text-center">
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
                <span className="font-medium text-zinc-800">轮廓光</span>
                <HelpCircle className="w-3 h-3 text-zinc-400 hover:text-zinc-600 cursor-help" />
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
                <div className="w-8 h-4 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-zinc-900 relative" />
              </label>
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
              title="应用打光效果并生成"
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

export default CanvasLightingModal;
