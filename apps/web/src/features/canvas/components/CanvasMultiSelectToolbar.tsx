import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Layers, Download, ImagePlus, X, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter } from 'lucide-react';
import type { CanvasNode } from '../types';
import { useCanvasStore } from '../store/useCanvasStore';
import { downloadMediaOrOpen } from '@/shared/media/downloadMedia';

export interface CanvasMultiSelectToolbarProps {
  projectId: string;
  selectedNodes: CanvasNode[];
  allNodes?: CanvasNode[];
  zoom: number;
  onClearSelection: () => void;
  onAddImagesToComposer?: (nodes: CanvasNode[]) => void;
}

export const CanvasMultiSelectToolbar: React.FC<CanvasMultiSelectToolbarProps> = ({
  projectId,
  selectedNodes,
  allNodes,
  zoom,
  onClearSelection,
  onAddImagesToComposer,
}) => {
  // 整理下拉菜单开关
  const [isOrganizeMenuOpen, setIsOrganizeMenuOpen] = useState(false);
  const organizeBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        organizeBtnRef.current &&
        !organizeBtnRef.current.contains(event.target as Node)
      ) {
        setIsOrganizeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, []);

  if (!selectedNodes || selectedNodes.length < 2) return null;

  // 计算多选节点的整体最小包围盒
  const minX = Math.min(...selectedNodes.map((n) => n.x));
  const minY = Math.min(...selectedNodes.map((n) => n.y));
  const maxX = Math.max(...selectedNodes.map((n) => n.x + n.width));
  const maxY = Math.max(...selectedNodes.map((n) => n.y + n.height));
  const bboxWidth = maxX - minX;
  const bboxHeight = maxY - minY;
  const centerX = minX + bboxWidth / 2;

  // 逆缩放比例，保证小缩放比下清晰可读且易于点击
  const labelScale = Math.min(2.2, Math.max(1, 1 / Math.max(zoom, 0.1)));

  const GAP = 16;

  // 1. 整理：宫格排列 / 水平排列 / 垂直排列
  const applyOrganize = (mode: 'grid' | 'horizontal' | 'vertical', e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOrganizeMenuOpen(false);

    const patches: Record<string, Partial<CanvasNode>> = {};
    const count = selectedNodes.length;

    if (mode === 'grid') {
      // 宫格排列：计算最接近正方形的列数
      const cols = Math.ceil(Math.sqrt(count));
      const sorted = [...selectedNodes].sort((a, b) => a.y - b.y || a.x - b.x);

      // 计算每列的最大宽度和每行的最大高度
      const colWidths: number[] = [];
      const rowHeights: number[] = [];
      sorted.forEach((node, idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        colWidths[c] = Math.max(colWidths[c] || 0, node.width);
        rowHeights[r] = Math.max(rowHeights[r] || 0, node.height);
      });

      // 计算每个单元格的左上角绝对坐标
      const colLefts = [minX];
      for (let i = 0; i < cols; i++) {
        colLefts[i + 1] = colLefts[i] + (colWidths[i] || 280) + GAP;
      }
      const rowTops = [minY];
      const rows = Math.ceil(count / cols);
      for (let j = 0; j < rows; j++) {
        rowTops[j + 1] = rowTops[j] + (rowHeights[j] || 280) + GAP;
      }

      sorted.forEach((node, idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        patches[node.id] = {
          x: colLefts[c],
          y: rowTops[r],
        };
      });
    } else if (mode === 'horizontal') {
      // 水平排列：所有图片单行水平铺开，Y 对齐到 minY
      const sorted = [...selectedNodes].sort((a, b) => a.x - b.x);
      let curX = minX;
      sorted.forEach((node) => {
        patches[node.id] = {
          x: curX,
          y: minY,
        };
        curX += node.width + GAP;
      });
    } else if (mode === 'vertical') {
      // 垂直排列：所有图片单列向下铺开，X 对齐到 minX
      const sorted = [...selectedNodes].sort((a, b) => a.y - b.y);
      let curY = minY;
      sorted.forEach((node) => {
        patches[node.id] = {
          x: minX,
          y: curY,
        };
        curY += node.height + GAP;
      });
    }

    useCanvasStore.getState().patchNodes(projectId, patches);
  };

  // 2. 成组 / 解组：成组后可以直接一起移动这些素材
  const firstGroupId = selectedNodes[0]?.groupId;
  const isAlreadyGrouped = firstGroupId && selectedNodes.every((n) => n.groupId === firstGroupId);

  const handleToggleGroup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const patches: Record<string, Partial<CanvasNode>> = {};

    if (isAlreadyGrouped) {
      // 解除成组
      selectedNodes.forEach((node) => {
        patches[node.id] = {
          groupId: undefined,
          isFoldLeader: undefined,
          foldedInGroupId: undefined,
          foldedCount: undefined,
        };
      });
    } else {
      // 成组：赋予统一的 groupId
      const newGroupId = crypto.randomUUID();
      selectedNodes.forEach((node) => {
        patches[node.id] = {
          groupId: newGroupId,
        };
      });
    }
    useCanvasStore.getState().patchNodes(projectId, patches);
  };

  // 3. 折叠 / 展开：折叠后先只显示一张，但其实是多张素材在一起，让画布更舒服
  const isAlreadyFolded = selectedNodes.some((n) => n.isFoldLeader || n.foldedInGroupId);

  const handleToggleFold = (e: React.MouseEvent) => {
    e.stopPropagation();
    const patches: Record<string, Partial<CanvasNode>> = {};

    if (isAlreadyFolded) {
      // 展开：恢复所有隐藏附属节点显示，并在主节点右侧规整排开
      const leader = selectedNodes.find((n) => n.isFoldLeader) || selectedNodes[0];
      const allRelated = (allNodes || selectedNodes).filter(
        (n) => n.id === leader.id || n.foldedInGroupId === leader.id || (leader.groupId && n.groupId === leader.groupId)
      );

      let currentX = leader.x + leader.width + GAP;
      allRelated.forEach((node) => {
        if (node.id === leader.id) {
          patches[node.id] = {
            isFoldLeader: false,
            foldedCount: undefined,
          };
        } else {
          patches[node.id] = {
            foldedInGroupId: undefined,
            x: currentX,
            y: leader.y,
          };
          currentX += node.width + GAP;
        }
      });
    } else {
      // 折叠：第 1 个节点作为主封面，其余节点标记为折叠收起
      const leader = selectedNodes[0];
      const targetGroupId = leader.groupId || crypto.randomUUID();

      selectedNodes.forEach((node, idx) => {
        if (idx === 0) {
          patches[node.id] = {
            groupId: targetGroupId,
            isFoldLeader: true,
            foldedInGroupId: undefined,
            foldedCount: selectedNodes.length,
          };
        } else {
          patches[node.id] = {
            groupId: targetGroupId,
            isFoldLeader: false,
            foldedInGroupId: leader.id,
            x: leader.x,
            y: leader.y,
          };
        }
      });
    }

    useCanvasStore.getState().patchNodes(projectId, patches);
  };

  // 4. 批量下载：选择后直接下载选择的所有素材
  const handleBatchDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectedNodes.forEach((node, idx) => {
      const url = node.imageUrl || node.videoUrl || node.audioUrl;
      if (url) {
        const ext = node.type === 'video' ? 'mp4' : node.type === 'audio' ? 'mp3' : 'png';
        const filename = `${node.title || '画布素材'}-${idx + 1}.${ext}`;
        setTimeout(() => {
          void downloadMediaOrOpen(url, filename).catch(console.error);
        }, idx * 250);
      }
    });
  };

  // 5. 添加到对话
  const handleBatchAddToComposer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddImagesToComposer) {
      onAddImagesToComposer(selectedNodes);
    }
  };

  return (
    <>
      {/* 🌟 多选外层包裹框与关闭按钮（图 1 与 图 2 的包围盒半透明背景） */}
      <div
        data-testid="canvas-multiselect-bounding-box"
        className={`pointer-events-none absolute z-10 rounded-3xl border ${
          isAlreadyGrouped
            ? 'border-indigo-500/70 bg-indigo-950/15 ring-2 ring-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.15)]'
            : 'border-slate-700/60 bg-black/25'
        } backdrop-blur-xs transition-all duration-200`}
        style={{
          left: `${minX - 14}px`,
          top: `${minY - 14}px`,
          width: `${bboxWidth + 28}px`,
          height: `${bboxHeight + 28}px`,
        }}
      >
        {/* 右上角取消多选关闭按钮（图 1 所示的 ✕） */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClearSelection();
          }}
          title="退出多选"
          aria-label="退出多选"
          className="pointer-events-auto absolute -right-2 -top-2 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-slate-400 shadow-md transition-colors hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* 🌟 顶部多选悬浮工具栏（暗黑磨砂玻璃胶囊，图 1 与 图 2 所示） */}
      <div
        data-testid="canvas-multiselect-toolbar"
        className="pointer-events-auto absolute z-40 flex items-center select-none"
        style={{
          left: `${centerX}px`,
          top: `${minY - 16}px`,
          transform: `translate(-50%, -100%) scale(${labelScale})`,
          transformOrigin: '50% 100%',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center gap-1 rounded-full border border-slate-700/80 bg-[#18181b]/95 px-2.5 py-1.5 text-white shadow-2xl backdrop-blur-md">
          {/* 1. 整理（带图 1 所示的弹出式下拉菜单：宫格排列、水平排列、垂直排列） */}
          <div className="relative">
            <button
              ref={organizeBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOrganizeMenuOpen((prev) => !prev);
              }}
              title="整理"
              aria-label="整理"
              className={`group/btn relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer active:scale-95 ${
                isOrganizeMenuOpen ? 'bg-white/20 text-white' : 'text-slate-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              {!isOrganizeMenuOpen && (
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900/95 px-2 py-0.5 text-[11px] font-medium text-white shadow-lg opacity-0 transition-all duration-150 scale-95 group-hover/btn:opacity-100 group-hover/btn:scale-100 z-50">
                  整理
                </span>
              )}
            </button>

            {/* 🌟 图 1 所示的暗色整理下拉菜单 */}
            {isOrganizeMenuOpen && (
              <div
                ref={menuRef}
                className="absolute bottom-full left-0 mb-2.5 flex w-32 flex-col gap-0.5 rounded-xl border border-slate-700/90 bg-[#1e1e20] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)] z-50"
              >
                <button
                  type="button"
                  onClick={(e) => applyOrganize('grid', e)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white text-left cursor-pointer"
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  <span>宫格排列</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => applyOrganize('horizontal', e)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white text-left cursor-pointer"
                >
                  <AlignHorizontalJustifyCenter className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  <span>水平排列</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => applyOrganize('vertical', e)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white text-left cursor-pointer"
                >
                  <AlignVerticalJustifyCenter className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  <span>垂直排列</span>
                </button>
              </div>
            )}
          </div>

          <div className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-700/80" />

          {/* 2. 成组 / 解除成组（图 2 所示） */}
          <button
            type="button"
            onClick={handleToggleGroup}
            title={isAlreadyGrouped ? '解除成组' : '成组'}
            aria-label={isAlreadyGrouped ? '解除成组' : '成组'}
            className={`group/btn relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer active:scale-95 ${
              isAlreadyGrouped ? 'bg-indigo-600/40 text-indigo-200' : 'text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="7" cy="7" r="3" />
              <circle cx="17" cy="17" r="3" />
              <path d="M7 10v2a5 5 0 0 0 5 5h2" />
            </svg>
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900/95 px-2 py-0.5 text-[11px] font-medium text-white shadow-lg opacity-0 transition-all duration-150 scale-95 group-hover/btn:opacity-100 group-hover/btn:scale-100 z-50">
              {isAlreadyGrouped ? '解除成组' : '成组'}
            </span>
          </button>

          <div className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-700/80" />

          {/* 3. 折叠 / 展开（图 3 所示） */}
          <button
            type="button"
            onClick={handleToggleFold}
            title={isAlreadyFolded ? '展开' : '折叠'}
            aria-label={isAlreadyFolded ? '展开' : '折叠'}
            className={`group/btn relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer active:scale-95 ${
              isAlreadyFolded ? 'bg-indigo-600/40 text-indigo-200' : 'text-slate-200 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900/95 px-2 py-0.5 text-[11px] font-medium text-white shadow-lg opacity-0 transition-all duration-150 scale-95 group-hover/btn:opacity-100 group-hover/btn:scale-100 z-50">
              {isAlreadyFolded ? '展开' : '折叠'}
            </span>
          </button>

          <div className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-700/80" />

          {/* 4. 批量下载（图 4 所示） */}
          <button
            type="button"
            onClick={handleBatchDownload}
            title="批量下载选中的图片/视频/音频节点"
            aria-label="批量下载选中的图片/视频/音频节点"
            className="group/btn relative flex h-7 w-7 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer active:scale-95"
          >
            <Download className="h-4 w-4" />
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900/95 px-2 py-0.5 text-[11px] font-medium text-white shadow-lg opacity-0 transition-all duration-150 scale-95 group-hover/btn:opacity-100 group-hover/btn:scale-100 z-50">
              批量下载选中的图片/视频/音频节点
            </span>
          </button>

          <div className="mx-0.5 h-3.5 w-px shrink-0 bg-slate-700/80" />

          {/* 5. 添加到对话 */}
          <button
            type="button"
            onClick={handleBatchAddToComposer}
            title="添加到对话"
            aria-label="添加到对话"
            className="group/btn relative flex h-7 w-7 items-center justify-center rounded-lg text-slate-200 transition-colors hover:bg-white/10 hover:text-white cursor-pointer active:scale-95"
          >
            <ImagePlus className="h-4 w-4" />
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900/95 px-2 py-0.5 text-[11px] font-medium text-white shadow-lg opacity-0 transition-all duration-150 scale-95 group-hover/btn:opacity-100 group-hover/btn:scale-100 z-50">
              添加到对话
            </span>
          </button>
        </div>
      </div>
    </>
  );
};

