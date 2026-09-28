import React, { useRef, type Dispatch, type SetStateAction } from 'react';
import type { CanvasNode } from '../model/types';
import { LIGHT_DIRECTION_COORDS_BY_VIEW, type LightingParams } from '../model/lighting';

export function CanvasLightingPreview({ node, params, setParams }: {
  node: CanvasNode;
  params: LightingParams;
  setParams: Dispatch<SetStateAction<LightingParams>>;
}) {
  const sphereRef = useRef<HTMLDivElement>(null);
  const isDraggingLightRef = useRef(false);
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
  );
}
