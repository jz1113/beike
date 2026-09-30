import React, { useRef, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MultiAngleParams, MultiAngleSource } from './multiAnglePresets';

interface MultiAngleViewportProps {
  node: MultiAngleSource;
  params: MultiAngleParams;
  setParams: React.Dispatch<React.SetStateAction<MultiAngleParams>>;
}

export function MultiAngleViewport({ node, params, setParams }: MultiAngleViewportProps) {
  const sphereRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const dragStartAnglesRef = useRef({ azimuth: 0, elevation: 0 });

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

  return (
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
  );
}
