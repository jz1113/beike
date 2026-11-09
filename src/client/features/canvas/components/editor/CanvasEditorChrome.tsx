import { openCanvasMediaLibrary } from '@client/shared/workspace/canvasWorkspace';
import { useEffect, useRef, useState } from 'react';
import {
  Plus, ZoomIn, ZoomOut,
  Download, FolderOpen, History, GalleryHorizontalEnd,
  Sun, Moon, Library, X, Map as MapIcon, PanelTop,
} from 'lucide-react';
import { useI18n } from '@client/shared/i18n';
import { useAppTheme } from '@client/shared/hooks/useAppTheme';
import { canvasZoomMin, canvasZoomMax } from '../../hooks/useCanvasGestures';

export interface CanvasEditorChromeProps {
  onArchive: (mode: 'export' | 'import') => void;
  onPublish: () => void;
  onOpenTasks?: () => void;
  tasksOpen: boolean;
  onToggleComposer?: () => void;
  handTool: boolean;
  setHandTool: (value: boolean) => void;
  handleBackToHome: () => void;
  minimapVisible: boolean;
  onToggleMinimap: () => void;
  setZoom: (zoom: number) => void;
  handleZoom: (delta: number) => void;
  zoom: number;

}

export function CanvasEditorChrome(p: CanvasEditorChromeProps) {
  const { t } = useI18n();
  const { isDark, toggleTheme } = useAppTheme();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomControl = useRef<HTMLDivElement>(null);
  const zoomButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!zoomOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !zoomControl.current?.contains(event.target)) setZoomOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setZoomOpen(false);
      zoomButton.current?.focus();
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [zoomOpen]);
  const tools = useRef<HTMLDivElement>(null);
  const plusButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!toolsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !tools.current?.contains(event.target)) setToolsOpen(false);
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setToolsOpen(false); plusButton.current?.focus(); } };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', key);
    };
  }, [toolsOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'v') { e.preventDefault(); p.setHandTool(false); }
      else if (key === 'h') { e.preventDefault(); p.setHandTool(true); }
      else if (e.key === 'Escape' && p.handTool) p.setHandTool(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const button =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-zinc-400 transition hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white disabled:opacity-25 cursor-pointer';
  const toolLabel = "relative after:pointer-events-none after:absolute after:left-full after:ml-3 after:translate-x-1 after:whitespace-nowrap after:rounded-full after:bg-zinc-900 after:px-3 after:py-1 after:text-xs after:font-medium after:text-white after:opacity-0 after:shadow-md after:content-[attr(aria-label)] hover:after:translate-x-0 hover:after:opacity-100 focus-visible:after:translate-x-0 focus-visible:after:opacity-100 motion-safe:after:transition motion-safe:after:duration-150 dark:after:bg-[#333336]";
  const railButton = `${button} ${toolLabel} rounded-full hover:ring-1 hover:ring-inset hover:ring-zinc-400/50 focus-visible:ring-1 focus-visible:ring-zinc-400`;
  const activeBtn =
    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/35 font-semibold';
  const surface =
    'rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-[#202024]/95 shadow-[0_6px_28px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.55)] backdrop-blur-xl';

  return (
    <>
      <button type="button" onClick={p.handleBackToHome} aria-label="返回主页" title="返回主页"
        className="canvas-fixed-ui absolute left-4 top-[10px] z-[60] grid size-[40px] place-items-center rounded-[14px] border border-black/10 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:bg-[#202022] dark:text-zinc-300 dark:hover:bg-zinc-800">
        <PanelTop size={18} />
      </button>
      <div
        ref={tools}
        role="toolbar"
        aria-label="画布工具"
        className="canvas-fixed-ui absolute left-4 top-[clamp(150px,50%,calc(100%-315px))] z-30 flex w-[50px] -translate-y-1/2 flex-col items-center gap-2 rounded-[24px] border border-black/10 bg-white py-[11px] dark:border-white/10 dark:bg-[#202022]"
      >
        <button
          type="button"
          className={`grid size-[34px] cursor-pointer place-items-center rounded-full bg-[#edb699] text-[#19191b] hover:bg-[#f4c7ae] ${toolsOpen ? "" : toolLabel}`}
          ref={plusButton}
          aria-label="更多工具"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen(open => !open)}
        >
          {toolsOpen ? <X size={19} /> : <Plus size={19} />}
        </button>
        <button type="button" className={railButton} aria-label="素材库" onClick={() => openCanvasMediaLibrary()}>
          <Library size={17} />
        </button>
        <button type="button" className={railButton} aria-label="同步到作品流" onClick={p.onPublish}>
          <GalleryHorizontalEnd size={17} />
        </button>
        {p.onOpenTasks && (
          <button type="button" data-tool-id="beike-tasks" className={`${railButton} ${p.tasksOpen ? activeBtn : ""}`} aria-label="生成历史" aria-expanded={p.tasksOpen} onClick={p.onOpenTasks}>
            <History size={17} />
          </button>
        )}
        {toolsOpen && (
          <div role="dialog" data-canvas-tools-menu aria-label="更多工具" onWheel={event => event.stopPropagation()}
            className="absolute bottom-0 left-full ml-1.5 max-h-[min(346px,calc(100dvh-16px))] w-[196px] overflow-y-auto overscroll-contain rounded-[15px] border border-black/10 bg-white p-2 text-xs text-zinc-700 sm:bottom-auto sm:top-2 dark:border-white/10 dark:bg-[#202022] dark:text-zinc-200">
            <div className="px-2 py-1 text-zinc-500 dark:text-zinc-400">项目备份</div>
            {[
              { label: '导出项目', icon: Download, action: () => p.onArchive('export') },
              { label: '导入与恢复项目', icon: FolderOpen, action: () => p.onArchive('import') },
            ].map(({ label, icon: Icon, action }) => (
              <button key={label} type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10" onClick={() => { setToolsOpen(false); action(); }}>
                <Icon size={15} />{label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div data-canvas-viewport-bar="true" className="canvas-fixed-ui absolute bottom-2 left-4 z-40 text-zinc-600 dark:text-zinc-400">
        <div className="flex h-9 items-center gap-1 rounded-xl border border-black/10 bg-white px-1 dark:border-white/10 dark:bg-[#202022]">
          <button type="button" onClick={toggleTheme} className="grid size-7 cursor-pointer place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
            title={isDark ? '切换为浅色画布' : '切换为深色画布'} aria-label="切换画布主题">
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button type="button" onClick={p.onToggleMinimap} aria-label="画布小地图" aria-expanded={p.minimapVisible}
            title={p.minimapVisible ? '收起画布地图' : '展开画布地图'}
            className="grid size-7 cursor-pointer place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"><MapIcon size={16}/></button>
          <span className="h-4 w-px bg-black/10 dark:bg-white/15" />
          <div ref={zoomControl}>
            <button ref={zoomButton} type="button" aria-label={`缩放 ${Math.round(p.zoom * 100)}%`}
              aria-expanded={zoomOpen} title="调整缩放比例" onClick={() => setZoomOpen(open => !open)}
              className="h-7 min-w-12 cursor-pointer rounded-md px-1 text-xs font-medium tabular-nums hover:bg-black/5 dark:hover:bg-white/10">{Math.round(p.zoom * 100)}%</button>
            {zoomOpen && <div role="group" aria-label="缩放调节" className={`absolute bottom-full left-0 mb-2 flex items-center gap-1.5 px-1.5 py-1 ${surface}`}>
              <button type="button" className={button} aria-label={t('canvas.zoomOut')} disabled={p.zoom <= canvasZoomMin} onClick={() => p.handleZoom(-0.1)}><ZoomOut size={16}/></button>
              <input type="range" aria-label="缩放比例" aria-valuetext={`${Math.round(p.zoom * 100)}%`}
                min={canvasZoomMin * 100} max={canvasZoomMax * 100} value={Math.round(p.zoom * 100)}
                onChange={event => p.setZoom(event.currentTarget.valueAsNumber / 100)}
                className="w-24 cursor-pointer accent-blue-500" />
              <span className="w-10 text-right text-xs font-medium tabular-nums">{Math.round(p.zoom * 100)}%</span>
              <button type="button" className={button} aria-label={t('canvas.zoomIn')} disabled={p.zoom >= canvasZoomMax} onClick={() => p.handleZoom(0.1)}><ZoomIn size={16}/></button>
              <button type="button" className={button} aria-label="关闭缩放调节" onClick={() => {setZoomOpen(false);zoomButton.current?.focus();}}><X size={16}/></button>
            </div>}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={p.onToggleComposer}
        aria-label="点击唤起AI创作助手"
        title="点击唤起AI创作助手"
        className="canvas-fixed-ui absolute bottom-4 right-4 z-40 grid size-9 cursor-pointer place-items-center rounded-full bg-[#edb699] text-[#19191b] hover:bg-[#f4c7ae] focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {[6, 10, 14, 10, 6].map((height, index) => <i key={index} className="w-0.5 rounded-full bg-current" style={{ height }} />)}
        </span>
      </button>
    </>
  );
}
