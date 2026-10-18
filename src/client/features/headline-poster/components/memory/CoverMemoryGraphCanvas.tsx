import { useState, useRef, type MouseEvent, type WheelEvent } from 'react';
import { Cpu, Layout, Type, Palette, FileText, ShieldAlert, Plus, Minus, Maximize2 } from 'lucide-react';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import type { CoverCorrection, CoverStyleSkill } from '../../model/coverSkillTypes';

interface Props {
  activeStyle: CoverStyleSkill;
  corrections: CoverCorrection[];
  onSelectBranch: (branchKey: string) => void;
  selectedBranch: string | null;
}

interface NodePosition {
  id: string;
  label: string;
  count: number;
  icon: typeof Layout;
  color: string;
  x: number;
  y: number;
}

export function CoverMemoryGraphCanvas({
  activeStyle,
  corrections,
  onSelectBranch,
  selectedBranch,
}: Props) {
  const { isDark } = useAppTheme();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // 画布中心坐标基准
  const centerNode = {
    x: 280,
    y: 280,
    width: 170,
    height: 100,
  };

  // 分支二级节点位置
  const branchNodes: NodePosition[] = [
    {
      id: 'layout',
      label: '构图与布局',
      count: activeStyle.features?.layout ? 5 : 0,
      icon: Layout,
      color: 'from-blue-500 to-indigo-600',
      x: 620,
      y: 110,
    },
    {
      id: 'typography',
      label: '字体艺术字',
      count: activeStyle.features?.typography ? 4 : 0,
      icon: Type,
      color: 'from-amber-500 to-orange-600',
      x: 680,
      y: 210,
    },
    {
      id: 'color',
      label: '配色与材质',
      count: activeStyle.features?.colorPalette ? 7 : 0,
      icon: Palette,
      color: 'from-sky-500 to-teal-600',
      x: 690,
      y: 330,
    },
    {
      id: 'copywriting',
      label: '文案与逻辑',
      count: activeStyle.features?.copywritingStyle ? 3 : 0,
      icon: FileText,
      color: 'from-purple-500 to-pink-600',
      x: 640,
      y: 440,
    },
    {
      id: 'corrections',
      label: '负向避坑记忆',
      count: activeStyle.negativeRules.length + corrections.length,
      icon: ShieldAlert,
      color: 'from-rose-500 to-red-600',
      x: 580,
      y: 530,
    },
  ];

  // 鼠标拖拽平移
  const handleMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-interactive="true"]')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x),
      y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y),
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // 滚轮缩放
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => Math.min(Math.max(0.6, prev * factor), 1.6));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // 生成三次方贝塞尔连接曲线
  const renderCurve = (target: NodePosition) => {
    const startX = centerNode.x + centerNode.width;
    const startY = centerNode.y + centerNode.height / 2;
    const endX = target.x;
    const endY = target.y + 24;
    const deltaX = Math.max(80, Math.abs(endX - startX) * 0.45);
    const pathData = `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`;
    const isSelected = selectedBranch === target.id;

    return (
      <g key={target.id}>
        <path
          d={pathData}
          fill="none"
          stroke={isSelected ? '#6366f1' : 'rgba(156, 163, 175, 0.4)'}
          strokeWidth={isSelected ? 2.5 : 1.5}
          strokeDasharray={target.id === 'corrections' ? '4 3' : undefined}
          className="transition-colors duration-300"
        />
        {/* 流光微粒 */}
        {isSelected && (
          <circle r="3.5" fill="#6366f1">
            <animateMotion path={pathData} dur="3s" repeatCount="indefinite" />
          </circle>
        )}
      </g>
    );
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className={`relative h-full w-full overflow-hidden select-none bg-[#FDFBF7] dark:bg-[#121214] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      {/* 点阵网格背景 (Dot-Matrix Pattern) */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20"
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(rgba(255,255,255,0.28) 1.2px, transparent 1.2px)'
            : 'radial-gradient(#a1a1aa 1.2px, transparent 1.2px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* 缩放平移渲染层 */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 pointer-events-auto h-[1200px] w-[1600px]"
      >
        {/* SVG 连线层 */}
        <svg className="absolute inset-0 h-full w-full pointer-events-none">
          {branchNodes.map((target) => renderCurve(target))}
        </svg>

        {/* 1. 中心风格节点（发光芯片） */}
        <div
          data-interactive="true"
          style={{ left: `${centerNode.x}px`, top: `${centerNode.y}px`, width: `${centerNode.width}px` }}
          className="absolute z-10 flex flex-col justify-between rounded-2xl border border-amber-500/40 bg-white/95 dark:bg-[#1C1A17] p-3.5 shadow-[0_12px_36px_-8px_rgba(245,158,11,0.35)] ring-2 ring-amber-400/20 backdrop-blur transition hover:scale-105"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Cpu className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">风格中枢核心</div>
              <div className="truncate text-xs font-black text-slate-900 dark:text-white">{activeStyle.name}</div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-amber-200/50 dark:border-white/5 pt-1.5 text-[10px] text-slate-500">
            <span>样本吸收: {activeStyle.sampleCount || 1} 张</span>
            <span className="rounded bg-amber-100 dark:bg-amber-950/60 px-1 py-0.2 font-bold text-amber-700 dark:text-amber-300">活跃</span>
          </div>
        </div>

        {/* 2. 发散二级球形节点 */}
        {branchNodes.map((node) => {
          const isSelected = selectedBranch === node.id;
          const Icon = node.icon;
          return (
            <button
              key={node.id}
              type="button"
              data-interactive="true"
              onClick={() => onSelectBranch(node.id)}
              style={{ left: `${node.x}px`, top: `${node.y}px` }}
              className={`absolute z-10 flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition-all shadow-sm ${isSelected ? 'border-indigo-500 bg-indigo-50/90 dark:bg-indigo-950/60 ring-2 ring-indigo-500/30 scale-105' : 'border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#1A1A1E]/90 hover:border-slate-300 dark:hover:border-white/20'}`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr ${node.color} text-white shadow-sm`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{node.label}</div>
                <div className="text-[10px] text-slate-400">{node.count} 条特征基因</div>
              </div>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500'}`}>
                {node.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 左下角画布视窗控制器 (Zoom & Reset) */}
      <div className="absolute bottom-6 left-6 z-20 flex items-center gap-1 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#1A1A1D]/90 p-1.5 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          title="放大"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="w-11 text-center text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          title="缩小"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 ml-0.5"
          title="还原并居中"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 底部小提示 */}
      <div className="absolute bottom-6 right-6 z-20 hidden sm:flex items-center gap-2 rounded-xl bg-slate-900/80 px-3 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur">
        <span>拖拽画布浏览，点击节点展开该分支的设计图谱</span>
      </div>
    </div>
  );
}
