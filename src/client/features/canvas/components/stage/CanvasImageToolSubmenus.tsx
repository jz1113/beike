import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  ChevronDown,
  ChevronRight,
  FastForward,
  Grid3X3,
  LayoutGrid,
  MountainSnow,
  Rewind,
  ScanFace,
  SunMedium,
  Table2,
  UserCog,
  UserRound,
  X,
} from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasNode } from '../../model/types';

export interface CanvasGridSkillPreset {
  id: string;
  label: string;
  aspect: '1:1' | '16:9';
  dividerBefore?: boolean;
  prompt: string;
}

/**
 * Liblib Canvas 九宫格 / 设定图 / 画面推演 11 项专业 Skill 预设与内置提示词
 */
export const CANVAS_GRID_SKILL_PRESETS: CanvasGridSkillPreset[] = [
  {
    id: 'multi-camera-9grid',
    label: '多机位九宫格',
    aspect: '1:1',
    prompt:
      '参考 @图片1 的人物/主体形象、服装材质与环境光影，生成一张 3×3 多机位九宫格联系表（Multi-Camera 9-Grid Contact Sheet）。包含 9 个不同景别与机位角度：1.正面中景、2.侧面特写、3.高机位俯拍全景、4.低机位仰拍、5.三分之四侧脸近景、6.过肩镜头、7.背面全身、8.局部细节微距、9.动态抓拍镜头。严格保持主体身份、五官特征、服饰与色调在全部 9 个镜头中高度一致，网格排版整齐无边框重叠。',
  },
  {
    id: 'character-three-view',
    label: '角色三视图',
    aspect: '16:9',
    prompt:
      '参考 @图片1 的角色形象，生成标准角色全身三视图（Character Turnaround Sheet：正面视图 Front View、侧面视图 Side View、背面视图 Back View）。三个视角从左至右水平并排站立（标准自然站姿），头顶与脚底水平对齐、身材比例完全一致，服装结构、配饰细节、发型与材质纹理在三视图中严格呼应，纯净中性浅灰背景，正交无透视畸变。',
  },
  {
    id: 'character-design-sheet',
    label: '角色设定图',
    aspect: '16:9',
    prompt:
      '参考 @图片1 的角色，生成完整角色概念设定图（Character Concept Design Sheet）。画面包含：左侧全身主视觉立绘，右侧排布角色正侧面结构展示、4 种核心面部表情特写（喜悦、严肃、惊讶、沉思）以及关键服装道具与材质细节拆解图。保持角色面部特征、色彩体系与画风高度统一，专业美术设定集排版。',
  },
  {
    id: 'character-face-three-view',
    label: '角色脸部三视图',
    aspect: '16:9',
    prompt:
      '参考 @图片1 的角色面部特征，生成角色脸部三视图（Facial Turnaround Sheet：正脸 0° Front、斜侧脸 45° Three-Quarter、正侧脸 90° Profile）。三个头部视角水平等高排列，五官比例、骨相轮廓、眉眼间距、鼻梁弧度、唇形与发型发际线细节高度一致，柔和均匀影棚布光，高精皮肤纹理与眼神光，纯净浅灰背景。',
  },
  {
    id: 'story-progression-4grid',
    label: '剧情推演四宫格',
    aspect: '16:9',
    prompt:
      '参考 @图片1 的角色、场景与故事氛围，生成 2×2 剧情推演四宫格分镜图（2×2 Sequential Narrative Storyboard）。按「起、承、转、合」四个连续时间节点推进画面叙事：第 1 格承接原图情境，第 2 格动作或冲突展开，第 3 格情绪与戏剧张力高潮，第 4 格关键转折或余韵收尾。保持人物造型、环境空间与电影级色调在四格中连贯统一。',
  },
  {
    id: 'scene-design-sheet',
    label: '场景设定图',
    aspect: '16:9',
    prompt:
      '参考 @图片1 的环境风格与空间美学，生成完整场景概念设定图（Environment Concept Design Sheet）。包含：主视角全景概念图、空间平面布局与动线示意、关键建筑或室内陈设结构拆解、昼夜/冷暖光影氛围小稿以及核心材质表面细节放大图。保持建筑语言、透视尺度与光影美学高度统一。',
  },
  {
    id: 'product-design-sheet',
    label: '产品设定图',
    aspect: '16:9',
    prompt:
      '参考 @图片1 的产品造型与工业设计语言，生成专业工业产品设定图（Product Industrial Design Sheet）。画面包含：主视角立体渲染图、正/侧/顶正交三视图、关键结构爆炸拆解图（Exploded View）以及表面材质工艺与接口微距细节特写。精准还原工业倒角、高光反射与 CMF 材质质感，极简纯净展示背景。',
  },
  {
    id: 'cinematic-lighting-grade',
    label: '电影级光影校正',
    aspect: '16:9',
    prompt:
      '参考 @图片1 的构图与主体，进行电影级光影校正与重布光（Cinematic Relighting & Color Grading）。统一全局主光源方向与冷暖色温对比，增强空间体积光（Volumetric Lighting）、环境光遮蔽（AO）与柔和轮廓光，优化高光滚降与暗部层次细节，呈现胶片级电影画面质感，严格保持主体五官与结构不变。',
  },
  {
    id: 'storyboard-25grid',
    label: '25宫格连贯分镜',
    aspect: '16:9',
    prompt:
      '参考 @图片1 的人物、服装与场景设定，生成 5×5 共 25 宫格连贯电影分镜联系表（5×5 Continuous Cinematic Storyboard Contact Sheet）。25 个画面按时间顺序从左到右、从上到下连贯演进，涵盖远景建立镜头、中景互动、近景情绪反应、特写细节与机位推拉摇移变化，严格保持主角外观、空间逻辑与电影光影色调贯穿始终。',
  },
  {
    id: 'time-forward-3s',
    label: '画面推演-3秒后',
    aspect: '16:9',
    dividerBefore: true,
    prompt:
      '参考 @图片1 的当前画面，精准推演并生成「3秒后」的连续画面（Temporal Continuation +3 Seconds）。延续原图人物的动作惯性、视线方向、表情变化以及物理环境动态（如衣摆飘动、光影移动、镜头轻微推进），严格保持人物身份、服装道具、场景空间与光影风格完全一致，呈现自然真实的下一拍电影画面。',
  },
  {
    id: 'time-backward-5s',
    label: '画面推演-5秒前',
    aspect: '16:9',
    prompt:
      '参考 @图片1 的当前画面，精准逆向推演并生成「5秒前」的前置画面（Temporal Prequel -5 Seconds）。还原导致当前画面发生前 5 秒的起始动作、人物站位与蓄势状态，严格保持人物身份、服装道具、场景空间架构与光影色温完全一致，使两幅画面构成因果连贯的电影前后镜头。',
  },
];

export function isCanvasGridSkillTitle(title?: string | null): boolean {
  if (!title) return false;
  return CANVAS_GRID_SKILL_PRESETS.some((item) => item.label === title);
}

export function getCanvasGridSkillPreset(idOrLabel?: string | null): CanvasGridSkillPreset | undefined {
  if (!idOrLabel) return undefined;
  return CANVAS_GRID_SKILL_PRESETS.find((item) => item.id === idOrLabel || item.label === idOrLabel);
}

function renderSkillPresetIcon(id: string) {
  switch (id) {
    case 'multi-camera-9grid':
      return <Grid3X3 size={14} className="shrink-0 opacity-85" />;
    case 'character-three-view':
      return <UserRound size={14} className="shrink-0 opacity-85" />;
    case 'character-design-sheet':
      return <UserCog size={14} className="shrink-0 opacity-85" />;
    case 'character-face-three-view':
      return <ScanFace size={14} className="shrink-0 opacity-85" />;
    case 'story-progression-4grid':
      return <LayoutGrid size={14} className="shrink-0 opacity-85" />;
    case 'scene-design-sheet':
      return <MountainSnow size={14} className="shrink-0 opacity-85" />;
    case 'product-design-sheet':
      return <Box size={14} className="shrink-0 opacity-85" />;
    case 'cinematic-lighting-grade':
      return <SunMedium size={14} className="shrink-0 opacity-85" />;
    case 'storyboard-25grid':
      return <Table2 size={14} className="shrink-0 opacity-85" />;
    case 'time-forward-3s':
      return <FastForward size={14} className="shrink-0 opacity-85" />;
    case 'time-backward-5s':
      return <Rewind size={14} className="shrink-0 opacity-85" />;
    default:
      return <Grid3X3 size={14} className="shrink-0 opacity-85" />;
  }
}

export function spawnCanvasGridSkillNode({
  projectId,
  sourceNode,
  preset,
  setSelectedNodeId,
  setEditingDrawingId,
}: {
  projectId: string;
  sourceNode: CanvasNode;
  preset: CanvasGridSkillPreset;
  setSelectedNodeId: (id: string | null) => void;
  setEditingDrawingId: (id: string | null) => void;
}) {
  const store = useCanvasStore.getState();
  const existing = store.projects
    .find((p) => p.id === projectId)
    ?.nodes.find(
      (n) =>
        n.type === 'drawing' &&
        n.title === preset.label &&
        (n.referenceNodeIds || []).includes(sourceNode.id),
    );
  if (existing) {
    setSelectedNodeId(existing.id);
    setEditingDrawingId(existing.id);
    return;
  }
  const nextId = crypto.randomUUID();
  const imageUrl = sourceNode.imageUrl || '';
  store.addNode(projectId, {
    id: nextId,
    type: 'drawing',
    generationKind: 'image',
    title: preset.label,
    content: preset.prompt,
    referenceImageUrl: imageUrl || undefined,
    referenceNodeIds: [sourceNode.id],
    x: sourceNode.x + sourceNode.width + 88,
    y: sourceNode.y,
    width: 540,
    height: 304,
    specialized: {
      operation: `skill:${preset.id}`,
    },
    drawing: {
      model: '',
      quality: 'medium',
      aspect: preset.aspect,
      count: 1,
      references: imageUrl ? [imageUrl] : [],
    },
  });
  setSelectedNodeId(nextId);
  setEditingDrawingId(nextId);
}

/**
 * 九宫格 / 设定图 / 画面推演 级联子菜单
 */
export function CanvasGridSkillsSubmenu({
  node,
  projectId,
  onRequestClose,
  setSelectedNodeId,
  setEditingDrawingId,
}: {
  node: CanvasNode;
  projectId: string;
  onRequestClose: () => void;
  setSelectedNodeId: (id: string | null) => void;
  setEditingDrawingId: (id: string | null) => void;
}) {
  const { isDark } = useAppTheme();
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleOpen = useCallback(() => {
    clearTimer();
    setOpen(true);
  }, [clearTimer]);

  const handleDelayedClose = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(false), 140);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  useLayoutEffect(() => {
    if (!open) return;
    const syncPosition = () => {
      const triggerEl = triggerRef.current;
      const popupEl = popupRef.current;
      if (!triggerEl || !popupEl) return;
      const tr = triggerEl.getBoundingClientRect();
      const pr = popupEl.getBoundingClientRect();
      const pad = 8;
      const gap = 8;
      const left =
        tr.right + gap + pr.width <= window.innerWidth - pad
          ? tr.right + gap
          : Math.max(pad, tr.left - gap - pr.width);
      const top = Math.min(
        Math.max(pad, tr.top),
        Math.max(pad, window.innerHeight - pr.height - pad),
      );
      popupEl.style.left = `${left}px`;
      popupEl.style.top = `${top}px`;
    };
    syncPosition();
    let raf = requestAnimationFrame(function loop() {
      syncPosition();
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const popup =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popupRef}
            data-grid-skills-submenu="true"
            onMouseEnter={clearTimer}
            onMouseLeave={handleDelayedClose}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={`fixed z-[10220] flex min-w-[184px] flex-col rounded-2xl border py-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.68)] ${
              isDark
                ? 'border-white/10 bg-[#1e1e22] text-zinc-100'
                : 'border-slate-200 bg-white text-zinc-900'
            }`}
          >
            {CANVAS_GRID_SKILL_PRESETS.map((preset) => (
              <React.Fragment key={preset.id}>
                {preset.dividerBefore && (
                  <div className="my-1 h-px bg-slate-200 dark:bg-white/10" />
                )}
                <button
                  type="button"
                  data-grid-skill-id={preset.id}
                  onClick={() => {
                    setOpen(false);
                    onRequestClose();
                    spawnCanvasGridSkillNode({
                      projectId,
                      sourceNode: node,
                      preset,
                      setSelectedNodeId,
                      setEditingDrawingId,
                    });
                  }}
                  className="flex w-full items-center gap-2.5 whitespace-nowrap px-3.5 py-2 text-left text-xs text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/10 cursor-pointer"
                >
                  {renderSkillPresetIcon(preset.id)}
                  <span>{preset.label}</span>
                </button>
              </React.Fragment>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleOpen}
      onMouseLeave={handleDelayedClose}
      className={`flex w-full items-center px-3.5 py-2 text-xs transition-colors ${
        open
          ? 'bg-zinc-100 text-zinc-900 dark:bg-[#362923] dark:text-[#f5b895]'
          : 'text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-[#362923] dark:hover:text-[#f5b895]'
      }`}
    >
      <button
        type="button"
        data-tool-id="gridSkills"
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
      >
        <Grid3X3 size={14} className="shrink-0 opacity-85" />
        <span className="whitespace-nowrap">九宫格</span>
      </button>
      <ChevronRight size={13} className="ml-2 shrink-0 opacity-60" />
      {popup}
    </div>
  );
}

const MAX_QUICK_SPLIT = 9;

function clampGridCount(value: number): number {
  return Math.max(1, Math.min(MAX_QUICK_SPLIT, value));
}

function QuickSplitDotsIcon({ className = '' }: { className?: string }) {
  const coords = [5, 12, 19];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      {coords.flatMap((cy) =>
        coords.map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2.15} />),
      )}
    </svg>
  );
}

/**
 * 执行图片快速切分：先在画布右侧生成 N×M 个带「切分中...」状态的占位图片节点，再逐格裁切填充
 */
export async function runCanvasQuickGridSplit({
  projectId,
  sourceNode,
  rows,
  columns,
}: {
  projectId: string;
  sourceNode: CanvasNode;
  rows: number;
  columns: number;
}): Promise<void> {
  const imageUrl = sourceNode.imageUrl;
  if (!imageUrl) return;
  const rCount = clampGridCount(rows);
  const cCount = clampGridCount(columns);

  const srcW = sourceNode.resultWidth || sourceNode.width || 320;
  const srcH = sourceNode.resultHeight || sourceNode.height || 320;
  const cellAspect = Math.max(0.25, Math.min(4, (srcW / cCount) / Math.max(1, srcH / rCount)));
  const tileW = Math.max(180, Math.min(280, Math.round(sourceNode.width || 260)));
  const tileH = Math.max(120, Math.round(tileW / cellAspect));
  const gapX = 24;
  const gapY = 36;
  const startX = sourceNode.x + sourceNode.width + 88;
  const startY = sourceNode.y;

  const store = useCanvasStore.getState();
  const tileTargets: Array<{ id: string; row: number; col: number }> = [];

  for (let r = 0; r < rCount; r++) {
    for (let c = 0; c < cCount; c++) {
      const id = crypto.randomUUID();
      tileTargets.push({ id, row: r, col: c });
      store.addNode(projectId, {
        id,
        type: 'image',
        title: sourceNode.title || '切分素材',
        status: 'generating',
        imageUrl: undefined,
        x: startX + c * (tileW + gapX),
        y: startY + r * (tileH + gapY),
        width: tileW,
        height: tileH,
        specialized: {
          operation: 'quick-split',
        },
      });
    }
  }

  try {
    const rawUrl = proxyMediaUrl(imageUrl) || imageUrl;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => {
        if (el.src !== imageUrl) {
          el.src = imageUrl;
          return;
        }
        reject(new Error('加载源图片失败'));
      };
      el.src = rawUrl;
    });

    const natW = img.naturalWidth || srcW;
    const natH = img.naturalHeight || srcH;

    for (const tile of tileTargets) {
      await new Promise((res) => window.setTimeout(res, 75));
      const sx = Math.round((tile.col * natW) / cCount);
      const ex = Math.round(((tile.col + 1) * natW) / cCount);
      const sy = Math.round((tile.row * natH) / rCount);
      const ey = Math.round(((tile.row + 1) * natH) / rCount);
      const sw = Math.max(1, ex - sx);
      const sh = Math.max(1, ey - sy);

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const dataUrl = canvas.toDataURL('image/png');

      useCanvasStore.getState().updateNode(projectId, tile.id, {
        imageUrl: dataUrl,
        status: 'idle',
        resultWidth: sw,
        resultHeight: sh,
        specialized: undefined,
      });
    }
  } catch {
    for (const tile of tileTargets) {
      useCanvasStore.getState().updateNode(projectId, tile.id, {
        status: 'error',
        content: '切分失败，请重试',
      });
    }
  }
}

/**
 * 桥豆麻衣酱同款 9×9 快速切分网格选择器子菜单
 */
export function CanvasQuickSplitSubmenu({
  node,
  projectId,
  onRequestClose,
}: {
  node: CanvasNode;
  projectId: string;
  onRequestClose: () => void;
}) {
  const { isDark } = useAppTheme();
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const selectionRef = useRef({ rows: 2, columns: 2 });
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState({ rows: 2, columns: 2 });

  const updateSelection = useCallback((next: { rows: number; columns: number }) => {
    const cur = selectionRef.current;
    if (cur.rows !== next.rows || cur.columns !== next.columns) {
      selectionRef.current = next;
      setSelection(next);
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleOpen = useCallback(() => {
    clearTimer();
    setOpen(true);
  }, [clearTimer]);

  const handleDelayedClose = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(false), 140);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  useLayoutEffect(() => {
    if (!open) return;
    const syncPosition = () => {
      const triggerEl = triggerRef.current;
      const popupEl = popupRef.current;
      if (!triggerEl || !popupEl) return;
      const tr = triggerEl.getBoundingClientRect();
      const pr = popupEl.getBoundingClientRect();
      const pad = 8;
      const gap = 8;
      const left =
        tr.right + gap + pr.width <= window.innerWidth - pad
          ? tr.right + gap
          : Math.max(pad, tr.left - gap - pr.width);
      const top = Math.min(
        Math.max(pad, tr.top),
        Math.max(pad, window.innerHeight - pr.height - pad),
      );
      popupEl.style.left = `${left}px`;
      popupEl.style.top = `${top}px`;
    };
    syncPosition();
    let raf = requestAnimationFrame(function loop() {
      syncPosition();
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const handleGridPointer = useCallback(
    (clientX: number, clientY: number) => {
      const gridEl = gridRef.current;
      if (!gridEl) return;
      const rect = gridEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const relX = Math.min(Math.max(clientX - rect.left, 0), rect.width - 0.001);
      const relY = Math.min(Math.max(clientY - rect.top, 0), rect.height - 0.001);
      const columns = clampGridCount(Math.floor((relX / rect.width) * MAX_QUICK_SPLIT) + 1);
      const rows = clampGridCount(Math.floor((relY / rect.height) * MAX_QUICK_SPLIT) + 1);
      updateSelection({ rows, columns });
    },
    [updateSelection],
  );

  const handleConfirmSplit = useCallback(() => {
    const { rows, columns } = selectionRef.current;
    setOpen(false);
    onRequestClose();
    void runCanvasQuickGridSplit({
      projectId,
      sourceNode: node,
      rows,
      columns,
    });
  }, [node, onRequestClose, projectId]);

  const unselectedCellClass = isDark
    ? 'border-white/[0.06] bg-[#3a3a3a]'
    : 'border-zinc-200 bg-zinc-100';
  const selectedCellClass = isDark
    ? 'border-white/45 bg-white/[0.18]'
    : 'border-zinc-500 bg-zinc-300/70';

  const popup =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popupRef}
            data-quick-grid-split-picker="true"
            onMouseEnter={clearTimer}
            onMouseLeave={handleDelayedClose}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={`fixed z-[10220] w-[224px] rounded-2xl border p-3 shadow-2xl ${
              isDark
                ? 'border-zinc-700 bg-[#262626] text-zinc-100'
                : 'border-zinc-200 bg-white text-zinc-900'
            }`}
          >
            <div
              ref={gridRef}
              role="grid"
              aria-label="选择快速切分行列"
              aria-rowcount={MAX_QUICK_SPLIT}
              aria-colcount={MAX_QUICK_SPLIT}
              onPointerEnter={(e) => handleGridPointer(e.clientX, e.clientY)}
              onPointerMove={(e) => handleGridPointer(e.clientX, e.clientY)}
              onClick={handleConfirmSplit}
              className="grid cursor-pointer gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${MAX_QUICK_SPLIT}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: MAX_QUICK_SPLIT * MAX_QUICK_SPLIT }, (_, index) => {
                const r = Math.floor(index / MAX_QUICK_SPLIT) + 1;
                const c = (index % MAX_QUICK_SPLIT) + 1;
                const active = r <= selection.rows && c <= selection.columns;
                return (
                  <div
                    key={`${r}-${c}`}
                    role="gridcell"
                    aria-selected={active}
                    aria-label={`${r} 行 ${c} 列`}
                    className={`pointer-events-none aspect-square rounded-[4px] border ${
                      active ? selectedCellClass : unselectedCellClass
                    }`}
                  />
                );
              })}
            </div>
            <div className="mt-3 text-center text-sm font-medium tabular-nums">
              {selection.rows}×{selection.columns}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleOpen}
      onMouseLeave={handleDelayedClose}
      className={`flex w-full items-center px-3.5 py-2 text-xs transition-colors ${
        open
          ? 'bg-zinc-100 text-zinc-900 dark:bg-[#362923] dark:text-[#f5b895]'
          : 'text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-[#362923] dark:hover:text-[#f5b895]'
      }`}
    >
      <button
        type="button"
        data-tool-id="quickSplit"
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer"
      >
        <QuickSplitDotsIcon className="shrink-0 opacity-85" />
        <span className="whitespace-nowrap">快速切分</span>
      </button>
      <ChevronRight size={13} className="ml-2 shrink-0 opacity-60" />
      {popup}
    </div>
  );
}

/**
 * 生图节点底部提示词栏的 Skill 胶囊切换器（支持一键切换 11 种九宫格/设定图/画面推演 Skill 提示词）
 */
export function CanvasGridSkillChip({
  preset,
  onSelectPreset,
  onClear,
}: {
  preset: CanvasGridSkillPreset;
  onSelectPreset: (next: CanvasGridSkillPreset) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0" data-grid-skill-chip-root="true">
      <div className="inline-flex h-7 items-stretch overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-xs font-medium text-slate-800 dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-white/90">
        <button
          type="button"
          data-grid-skill-chip="true"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex cursor-pointer items-center gap-1.5 px-2 hover:bg-slate-200 dark:hover:bg-white/[0.08]"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white">
            {renderSkillPresetIcon(preset.id)}
          </span>
          <span>{preset.label}</span>
          <ChevronDown size={12} />
        </button>
        <button
          type="button"
          aria-label="移除当前预设标签"
          title="移除当前预设标签"
          onClick={() => {
            setOpen(false);
            onClear();
          }}
          className="grid w-6 cursor-pointer place-items-center border-l border-slate-200 hover:bg-slate-200 dark:border-white/[0.14] dark:hover:bg-white/[0.08]"
        >
          <X size={12} />
        </button>
      </div>
      {open && (
        <div
          data-grid-skill-popover="true"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-[160] mt-2 flex min-w-[184px] flex-col rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e1e22] py-1.5 text-xs text-slate-800 dark:text-zinc-100 shadow-[0_18px_48px_rgba(0,0,0,0.68)] select-none"
        >
          {CANVAS_GRID_SKILL_PRESETS.map((item) => {
            const active = item.id === preset.id;
            return (
              <React.Fragment key={item.id}>
                {item.dividerBefore && <div className="my-1 h-px bg-slate-200 dark:bg-white/10" />}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelectPreset(item);
                  }}
                  className={`flex w-full items-center gap-2.5 whitespace-nowrap px-3.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-white/12 dark:text-white'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-zinc-200 dark:hover:bg-white/8'
                  }`}
                >
                  {renderSkillPresetIcon(item.id)}
                  <span>{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
