import { Plus, Minus, Scan, MousePointer2, Hand, Upload, Image, Video, Undo2, Redo2, Film, LayoutGrid } from 'lucide-react';
import type { RefObject } from 'react';
import { useI18n } from '@client/shared/i18n';
import type { CanvasNode, CanvasProject } from '../../model/types';

export interface CanvasEditorChromeProps {
  viewMode?: 'canvas' | 'storyboard';
  onToggleViewMode?: (mode: 'canvas' | 'storyboard') => void;
  openNodeMenuAt: (x: number, y: number) => void;
  handTool: boolean;
  setHandTool: (value: boolean) => void;
  history: {undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean};
  handleBackToHome: () => void;
  isEditingTitle: boolean;
  titleInputRef: RefObject<HTMLInputElement | null>;
  tempTitle: string;
  titleError: string;
  setTempTitle: (value: string) => void;
  setTitleError: (value: string) => void;
  skipTitleSaveOnBlurRef: { current: boolean };
  handleSaveTitle: () => void;
  handleCancelTitleEdit: () => void;
  displayProjectTitle: string;
  setIsEditingTitle: (value: boolean) => void;
  createProject: () => void;
  projects: CanvasProject[];
  currentProject: CanvasProject;
  selectProject: (id: string | null) => void;
  nodes: CanvasProject['nodes'];
  handleResetView: () => void;
  handleZoom: (delta: number) => void;
  zoom: number;
  addNode: (projectId: string, node: Omit<CanvasNode, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) => void;
  pan: { x: number; y: number };
  canvasViewportRef: RefObject<HTMLDivElement | null>;
  replacementNodeRef: { current: string | null };
  fileInputRef: RefObject<HTMLInputElement | null>;
  isAssetSubmenuOpen: boolean;
  setIsAssetSubmenuOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  handleOpenAssetModal: (type: 'image' | 'video') => void;
}

export function CanvasEditorChrome(p: CanvasEditorChromeProps) {
  const { t } = useI18n();
  const button = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white disabled:opacity-25';
  const surface = 'rounded-2xl border border-white/90 dark:border-white/10 bg-white/95 dark:bg-[#1B1B1E]/95 shadow-[0_6px_28px_rgba(15,23,42,0.08)] dark:shadow-none backdrop-blur-xl';
  const openPalette = () => {
    const rect = p.canvasViewportRef.current?.getBoundingClientRect();
    if (rect) p.openNodeMenuAt(rect.left + Math.min(320, rect.width / 2), rect.top + Math.min(180, rect.height / 3));
  };
  return <>
    <header className={`canvas-fixed-ui absolute left-4 top-4 z-40 flex h-12 max-w-[calc(100%-2rem)] items-center gap-1 px-2 ${surface}`}>
      <button type="button" className={button} onClick={p.handleBackToHome} title="贝壳云图 · 返回首页"><img src="/app_logo.png" alt="贝壳云图" className="h-8 w-8 object-contain" /></button>
      <div className="mx-1 h-5 w-px bg-slate-100 dark:bg-white/10" />
      <div className="relative min-w-0">
        {p.isEditingTitle ? <input ref={p.titleInputRef} aria-label="项目名称" aria-invalid={!!p.titleError} maxLength={40} value={p.tempTitle} onChange={e=>{p.setTempTitle(e.target.value);p.setTitleError('');}} onFocus={e=>e.target.select()} onBlur={()=>{if(p.skipTitleSaveOnBlurRef.current){p.skipTitleSaveOnBlurRef.current=false;return;}p.handleSaveTitle();}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape')p.handleCancelTitleEdit();}} className="w-40 rounded-lg bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white px-2 py-1.5 text-sm outline-indigo-300" /> : <button type="button" aria-label="重命名画布" title="双击重命名画布" onDoubleClick={()=>p.setIsEditingTitle(true)} onKeyDown={e=>{if(e.key==='Enter' || e.key==='F2'){e.preventDefault();p.setIsEditingTitle(true);}}} className="flex max-w-56 items-center gap-5 rounded-lg px-2 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10"><span className="truncate">{p.displayProjectTitle}</span></button>}
        {p.titleError && <p role="alert" className="absolute top-full rounded bg-white dark:bg-[#1B1B1E] p-2 text-xs text-red-600 dark:text-rose-400">{p.titleError}</p>}
      </div>
      <div className="mx-1 h-5 w-px bg-slate-100 dark:bg-white/10" />
      <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-slate-100 dark:bg-white/5">
        <button
          type="button"
          onClick={() => p.onToggleViewMode?.('canvas')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            p.viewMode !== 'storyboard'
              ? 'bg-white dark:bg-[#26262B] text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <LayoutGrid size={13} />
          <span>画布</span>
        </button>
        <button
          type="button"
          onClick={() => p.onToggleViewMode?.('storyboard')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            p.viewMode === 'storyboard'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Film size={13} />
          <span>故事板</span>
        </button>
      </div>
    </header>
    <div role="toolbar" aria-label="画布工具" className={`canvas-fixed-ui absolute left-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 p-1.5 ${surface}`}>
      <button className={`${button} bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 hover:text-white dark:hover:text-slate-900`} title="添加节点" aria-label="添加节点" onClick={openPalette}><Plus size={19}/></button>
      <div className="mx-2 my-1 border-t border-slate-100 dark:border-white/10"/>
      <button className={`${button} ${!p.handTool?'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400':''}`} aria-label="选择工具" title="选择 · V · 拖动空白处框选" aria-pressed={!p.handTool} onClick={()=>p.setHandTool(false)}><MousePointer2 size={17}/></button>
      <button className={`${button} ${p.handTool?'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400':''}`} aria-label="抓手工具" title="抓手 · H / 按住空格" aria-pressed={p.handTool} onClick={()=>p.setHandTool(true)}><Hand size={17}/></button>
      <div className="mx-2 my-1 border-t border-slate-100 dark:border-white/10"/>
      <button className={button} title="上传图片、视频或音频" aria-label="上传素材" onClick={()=>{p.replacementNodeRef.current=null;p.fileInputRef.current?.click();}}><Upload size={17}/></button>
      <button className={button} title="图片资产库" onClick={()=>p.handleOpenAssetModal('image')}><Image size={17}/></button>
      <button className={button} title="视频资产库" onClick={()=>p.handleOpenAssetModal('video')}><Video size={17}/></button>
    </div>
    <div className={`canvas-fixed-ui absolute bottom-4 left-4 z-40 max-sm:bottom-20 flex items-center gap-0.5 p-1 ${surface}`}>
      <button className={button} title={t('canvas.zoomOut')} onClick={()=>p.handleZoom(-0.1)}><Minus size={15}/></button>
      <span className="min-w-10 text-center text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{Math.round(p.zoom*100)}%</span>
      <button className={button} title={t('canvas.zoomIn')} onClick={()=>p.handleZoom(0.1)}><Plus size={15}/></button>
      <button className={button} title={t('canvas.resetZoom')} onClick={p.handleResetView}><Scan size={16}/></button>
      <span className="mx-1 h-4 w-px bg-slate-100 dark:bg-white/10"/>
      <button className={button} title="撤销 · ⌘/Ctrl Z" disabled={!p.history.canUndo} onClick={p.history.undo}><Undo2 size={16}/></button>
      <button className={button} title="重做 · ⇧ ⌘/Ctrl Z" disabled={!p.history.canRedo} onClick={p.history.redo}><Redo2 size={16}/></button>
    </div>

  </>;
}
