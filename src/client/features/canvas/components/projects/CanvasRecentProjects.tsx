import { createPortal } from 'react-dom';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { useCanvasHydrated } from '../../hooks/useCanvasGenerationSync';
import {
  canvasSaveError,
  hasCanvasReadFailure,
  hasCanvasSaveFailure,
  isBuiltInCanvasProject,
  studioCover,
  visibleCanvasProjects,
} from '../../store/canvasProjectDefaults';
import { exportCanvasProject, restoreCanvasArchive } from '../../store/canvasArchiveStorage';
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { Plus, MoreHorizontal, Trash2, Edit2, Copy, ChevronRight, LayoutGrid } from 'lucide-react';
import { useCanvasStore, deleteCanvasProject, saveCanvasProjects } from '../../store/useCanvasStore';
import { readCanvasArchive, type CanvasArchive } from '../../model/canvasArchive';
import {
  filterCanvasProjects,
  type CanvasProjectOrder,
  type CanvasProjectPeriod,
} from '../../model/creativeWorkflowProjects';
import type { CanvasProject, StudioScene } from '../../model/types';

export function CanvasSaveStatus({ failuresOnly = false }: { failuresOnly?: boolean } = {}) {
  const [failed, setFailed] = useState(hasCanvasSaveFailure);
  const [saving, setSaving] = useState(false);
  const retryLock = useRef(false);
  useEffect(() => {
    const start = () => setSaving(true);
    const success = () => { setSaving(false); setFailed(false); };
    const failure = () => { setSaving(false); setFailed(true); };
    window.addEventListener('canvas-save-start', start);
    window.addEventListener('canvas-save-complete', success);
    window.addEventListener('canvas-save-error', failure);
    return () => {
      window.removeEventListener('canvas-save-start', start);
      window.removeEventListener('canvas-save-complete', success);
      window.removeEventListener('canvas-save-error', failure);
    };
  }, []);
  if (!failed) return failuresOnly ? null : <span role="status" className="text-xs text-stone-500">{saving ? '正在保存项目…' : '项目已保存到本机'}</span>;
  return <div role="alert" className="flex max-w-full flex-wrap items-center gap-2 rounded-lg bg-red-950 px-3 py-2 text-xs text-white">
    <span>{hasCanvasReadFailure() ? '无法读取本机项目，请重试读取。' : canvasSaveError() || '项目尚未保存，请勿刷新或关闭页面。'}</span>
    <button type="button" disabled={saving} className="rounded border border-white/40 px-2 py-1"
      onClick={() => {
        if (retryLock.current) return;
        retryLock.current = true;
        setSaving(true);
        void saveCanvasProjects().catch(() => {}).finally(() => { retryLock.current = false; setSaving(false); });
      }}>{saving ? '正在重试…' : hasCanvasReadFailure() ? '重试读取项目' : '重试保存'}</button>
  </div>;
}

export function CanvasArchiveDialog({ mode, snapshot, onClose, onRestored }: {
  mode: 'export' | 'import'; snapshot?: () => CanvasProject;
  onClose: () => void; onRestored: (project: CanvasProject) => void;
}) {
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const prepared = useRef<CanvasArchive | undefined>(undefined);
  const errorBox = useRef<HTMLParagraphElement>(null);
  const dialog = useModalDialog(true, () => { if (!lock.current) onClose(); });
  async function run() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('正在准备项目…');
    try {
      if (mode === 'export') {
        if (!snapshot) throw new Error('项目尚未准备好，请重新打开后重试');
        const project = snapshot();
        const blob = await exportCanvasProject(project, setMessage);
        await saveToDownloadDir(`${project.title}.zip`, blob);
        setMessage('已发起完整项目备份下载');
      } else {
        if (!file) throw new Error('请先选择项目 ZIP 或 JSON 文件');
        const archive = prepared.current ?? await readCanvasArchive(file, setMessage);
        prepared.current = archive;
        const project = await restoreCanvasArchive(archive, setMessage);
        onClose(); onRestored(project);
      }
    } catch (cause) {
      setMessage('');
      setError(cause instanceof SyntaxError ? '备份内容无法解析，请重新选择完整项目 ZIP 或 JSON'
        : cause instanceof Error ? cause.message : '项目操作失败，请重试');
      requestAnimationFrame(() => errorBox.current?.focus());
    } finally { lock.current = false; setBusy(false); }
  }
  const exporting = mode === 'export';
  return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-3">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={exporting ? '导出画布项目' : '导入与恢复画布项目'} tabIndex={-1}
      className="grid max-h-[85dvh] w-full max-w-md gap-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-xl dark:border-white/20 dark:bg-[#202023] dark:text-stone-200">
      <h2 className="text-base font-semibold">{exporting ? '导出画布项目' : '导入与恢复画布项目'}</h2>
      <p className="leading-relaxed text-slate-600 dark:text-stone-400">{exporting
        ? '支持旧画布和 Studio 画布，包含节点、连线、视口及图片、视频、音频和全部已保存生成版本。素材不完整时不会导出备份。'
        : '选择完整项目 ZIP 恢复旧画布或 Studio 画布；也支持旧项目和工作流 JSON，JSON 中的素材地址必须可读取。恢复后另建项目，保留原画布，不续接旧生成任务。'}</p>
      {!exporting && <label className="grid min-w-0 gap-2 font-medium">项目备份文件
        <input type="file" accept=".zip,.json,application/zip,application/json" aria-label="项目备份文件" disabled={busy}
          className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 p-2 text-xs dark:border-white/20"
          onChange={event => {
            const selected = event.currentTarget.files?.[0];
            if (selected) { setFile(selected); prepared.current = undefined; setError(''); setMessage(''); }
            event.currentTarget.value = '';
          }} />
        {file && <span className="break-all text-xs font-normal">已选择：{file.name}</span>}
      </label>}
      {message && <p role="status" className="break-words">{message}</p>}
      {error && <p ref={errorBox} role="alert" tabIndex={-1} className="break-words text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-4 dark:border-white/20" onClick={onClose}>关闭</button>
        <button type="button" disabled={busy || (!exporting && !file)} className="min-h-11 rounded-lg bg-indigo-600 px-4 text-white disabled:opacity-50" onClick={() => void run()}>
          {busy ? '正在处理…' : error ? (exporting ? '重试导出' : '重试恢复') : exporting ? '导出项目' : '恢复为新项目'}
        </button>
      </div>
    </div>
  </div>, document.body);
}

/** A local diagram preview; it never fetches media or changes the saved view. */
function CanvasScenePreview({ scene }: { scene?: StudioScene }) {
  const nodes = scene?.nodes.slice(0, 80).map(node => ({
    id: node.id,
    type: node.type,
    x: finite(node.x, 0), y: finite(node.y, 0),
    width: Math.max(40, finite(node.width, 300)),
    height: Math.max(40, finite(node.height, 240)),
  })) ?? [];
  if (!nodes.length) return null;
  const left = Math.min(...nodes.map(n => n.x));
  const top = Math.min(...nodes.map(n => n.y));
  const width = Math.max(...nodes.map(n => n.x + n.width)) - left;
  const height = Math.max(...nodes.map(n => n.y + n.height)) - top;
  const padding = Math.max(width, height) * 0.06;
  const byId = new Map(nodes.map(n => [n.id, n]));
  return <svg aria-hidden="true" viewBox={`${left-padding} ${top-padding} ${width+padding*2} ${height+padding*2}`}
    className="absolute inset-0 h-full w-full p-2 text-slate-400 dark:text-slate-500">
    {scene?.connections.map(edge => {
      const from = byId.get(edge.from), to = byId.get(edge.to);
      if (!from || !to) return null;
      const x = from.x + from.width, y = from.y + from.height / 2;
      const endY = to.y + to.height / 2, mid = (x + to.x) / 2;
      return <path key={edge.id} d={`M${x} ${y} C${mid} ${y} ${mid} ${endY} ${to.x} ${endY}`}
        fill="none" stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke" opacity="0.65" />;
    })}
    {nodes.map(node => <g key={node.id}>
      <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="16"
        fill="currentColor" opacity={node.type === 'text-node' ? 0.18 : 0.3} />
      <rect x={node.x+12} y={node.y+12} width={node.width-24} height="8" rx="4"
        fill={node.type === 'gen-video' ? '#d3a17f' : node.type === 'gen-image' ? '#8d9bc4' : 'currentColor'} opacity="0.8" />
    </g>)}
  </svg>;
}

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

interface CanvasRecentProjectsProps {
  onEnterCanvas?: (projectId: string) => void;
  className?: string;
  maxDisplay?: number;
  compact?: boolean;
  assetView?: boolean;
  onOpenAll?: () => void;
  legacySalesEntry?: boolean;
  onDismissLegacySales?: () => void;
}

export const CanvasRecentProjects: React.FC<CanvasRecentProjectsProps> = ({
  onEnterCanvas,
  className = '',
  maxDisplay = 7,
  compact = false,
  assetView = false,
  onOpenAll,
  legacySalesEntry,
  onDismissLegacySales,
}) => {
  const hydrated = useCanvasHydrated();
  const [importOpen,setImportOpen] = useState(false);
  const { projects:allProjects, createProject, selectProject, updateProjectTitle, duplicateProject } = useCanvasStore();
  const projects=useMemo(()=>visibleCanvasProjects(allProjects),[allProjects]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editingMenuButton = useRef<HTMLButtonElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const projectMenu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (menuOpenId) projectMenu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [menuOpenId]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState('');
  const operationLock = useRef(false);

  useEffect(() => {
    if (!menuOpenId) return;
    const handleClickOutside = () => setMenuOpenId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuOpenId]);

  const handleStartRename = (project: CanvasProject, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(project.id);
    setEditingTitle(project.title);
    setMenuOpenId(null);
  };

  const handleSaveRename = (id: string) => {
    if (editingTitle.trim()) {
      updateProjectTitle(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (operationLock.current) return;
    operationLock.current = true;
    setBusyId(id); setOperationError('');
    const trigger = e.currentTarget.closest('.relative.shrink-0')?.querySelector<HTMLButtonElement>('button');
    setMenuOpenId(null);
    const project = allProjects.find(item => item.id === id);
    try { if (project && await confirmAction({
      title:'删除画布项目', description:`永久删除「${project.title}」及其中的节点和连线？此操作无法撤销。`,
      confirmText:'删除项目', cancelText:'取消', danger:true,
    })) await deleteCanvasProject(id);
    } catch (error) { setOperationError(error instanceof Error ? error.message : '删除项目失败，请重试'); }
    finally {
      operationLock.current = false; setBusyId(null);
      requestAnimationFrame(()=> (trigger?.isConnected ? trigger : searchBox.current)?.focus());
    }
  };

  const handleDuplicate = async (project: CanvasProject, e: React.MouseEvent) => {
    e.stopPropagation();
    if (operationLock.current) return;
    operationLock.current = true; setBusyId(project.id); setOperationError(''); setMenuOpenId(null);
    try { await duplicateProject(project.id); await saveCanvasProjects(); }
    catch (error) { setOperationError(error instanceof Error ? error.message : '复制项目失败，请重试'); }
    finally { operationLock.current = false; setBusyId(null); searchBox.current?.focus(); }
  };

  useEffect(() => {
    if (legacySalesEntry) onDismissLegacySales?.();
  }, [legacySalesEntry, onDismissLegacySales]);

  const handleCreateNew = () => {
    if (!hydrated) return;
    const newProj = createProject();
    if (legacySalesEntry) onDismissLegacySales?.();
    onEnterCanvas?.(newProj.id);
  };

  const handleSelectCard = (id: string) => {
    if (!hydrated) return;
    selectProject(id);
    onEnterCanvas?.(id);
  };

  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<CanvasProjectOrder>('updated');
  const [period, setPeriod] = useState<CanvasProjectPeriod>('all');
  const search = query.trim().toLocaleLowerCase();
  const filteredProjects = filterCanvasProjects(projects, { query, order, period });
  const displayedProjects = !search && maxDisplay > 0 && (compact || !showAll) ? filteredProjects.slice(0, maxDisplay) : filteredProjects;
  const hasRecentProjects = projects.length > 0;

  const createCard = (
    <div className="relative">
    <button
      type="button"
      disabled={!hydrated}
      onClick={handleCreateNew}
      aria-label="新建画布"
      className={`group/new flex aspect-video w-full flex-col items-center justify-center gap-2 border text-slate-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400 disabled:cursor-wait disabled:opacity-60 dark:text-white ${assetView ? 'rounded-lg border-transparent bg-slate-100 hover:bg-slate-200 dark:bg-[#202020] dark:hover:bg-[#282828]' : 'rounded-2xl border-slate-200 bg-slate-50 bg-[radial-gradient(circle,#cbd5e1_1px,transparent_1px)] [background-size:22px_22px] hover:border-slate-400 dark:border-white/[0.08] dark:bg-[#1c1c1e] dark:bg-[radial-gradient(circle,#ffffff12_1px,transparent_1px)] dark:hover:border-white/25'}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center transition-transform group-hover/new:scale-110 ${assetView ? 'text-slate-700 dark:text-stone-200' : 'rounded-xl bg-white text-slate-900 shadow-sm'}`}>
        <Plus className="h-5 w-5" strokeWidth={2.2} />
      </span>
      {!assetView && <span className="text-sm font-medium">新建画布</span>}
    </button>
    </div>
  );

  return (
    <section aria-label={compact ? '最近画布' : '全部画布项目'} className={`relative w-full space-y-4 select-none ${className}`}>
      {compact && onOpenAll && <div className="flex h-5 justify-end">
        <button type="button" onClick={onOpenAll} className="rounded px-2 text-xs text-slate-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-400 dark:text-stone-400 dark:hover:text-white">全部</button>
      </div>}
      {assetView && <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pb-2 text-xs text-slate-600 dark:text-stone-400">
        <label className="flex items-center gap-2">时间<select aria-label="画布时间范围" value={period} onChange={event => setPeriod(event.target.value as CanvasProjectPeriod)} className="max-w-32 rounded-lg bg-transparent py-2 outline-offset-2 dark:bg-[#141414]"><option value="all">全部时间</option><option value="week">最近 7 天</option><option value="month">最近 30 天</option></select></label>
        <label className="flex items-center gap-2">排序<select aria-label="画布排序" value={order} onChange={event => setOrder(event.target.value as CanvasProjectOrder)} className="rounded-lg bg-transparent py-2 outline-offset-2 dark:bg-[#141414]"><option value="updated">最近修改</option><option value="created">最近创建</option><option value="title">名称</option></select></label>
        <input ref={searchBox} type="search" aria-label="搜索项目" placeholder="搜索画布" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) setQuery(''); }} className="ml-auto min-w-0 max-w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 dark:border-white/10" />
      </div>}
      {importOpen && <CanvasArchiveDialog mode="import" onClose={()=>setImportOpen(false)} onRestored={project=>{
        selectProject(project.id); onEnterCanvas?.(project.id);
      }}/>}
      {operationError && <p role="alert" className="break-words text-sm text-red-600">{operationError}</p>}
      {!hydrated && <p role="status" className="text-sm text-slate-500">正在读取本地项目…</p>}
      {/* 空画布不展示“最近项目 · 0 个画布”的无效标题行，直接给出新建入口。 */}
      {!compact && !assetView && hasRecentProjects && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 py-1">
            <span className="text-sm font-medium text-slate-700 dark:text-stone-300 tracking-tight">
              最近项目
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-[#8E8E93] font-medium font-mono">
              {projects.length} 个画布
            </span>
          </div>

          <input
            ref={searchBox}
            type="search"
            aria-label="搜索项目"
            placeholder="搜索项目"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape' && !event.nativeEvent.isComposing) setQuery('');
            }}
            className="ml-auto min-w-0 w-36 max-w-full rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-sm dark:border-white/10"
          />
          {!search && maxDisplay > 0 && projects.length > maxDisplay && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              aria-expanded={showAll}
              className="text-xs text-slate-400 hover:text-slate-700 dark:text-[#8E8E93] dark:hover:text-white flex items-center gap-0.5 transition-colors cursor-pointer"
            >
              {showAll ? '收起项目' : '查看全部项目'}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {(search || period !== 'all') && hasRecentProjects && !displayedProjects.length && <p role="status" className="text-sm text-slate-500">没有找到匹配的项目</p>}
      <div className={assetView ? 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] items-start gap-x-4 gap-y-7' : 'grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-4'}>
        {assetView ? <div className="flex min-w-0 flex-col gap-2">{createCard}<span className="px-3 text-[13px]">新建项目</span></div> : createCard}
        {displayedProjects.map((proj) => {
          const builtInCover = {
            'canvas-proj-a714dcc3-884f-4d7e-8506-75bb9f236d51': 'cover-generation.jpg',
            'canvas-proj-48b418d5-2107-4be4-aecf-15550440a32a': 'commerce-images.jpg',
            'canvas-proj-ae2b76ea-4b54-486d-b93b-553972331709': 'commerce-video.jpg',
          }[proj.id];
          const cover = builtInCover ? `${import.meta.env.BASE_URL}canvas-covers/${builtInCover}`
            : studioCover(proj.studioScene) || proj.thumbnail;
          const nodeCount = proj.studioScene?.nodes.length ?? proj.nodes.length;
          const detail = nodeCount ? `${nodeCount} 个节点` : proj.studioScene?.strokes?.length ? '手绘画布' : proj.studioScene?.textBoxes?.length ? '文本画布' : '项目画布';
          const isEditing = editingId === proj.id;
          const isMenuOpen = menuOpenId === proj.id;
          const isBuiltIn = isBuiltInCanvasProject(proj.id);

          return (
            <div
              key={proj.id}
              onClick={() => {
                if (!isEditing) handleSelectCard(proj.id);
              }}
              className="group/card relative flex min-w-0 cursor-pointer flex-col gap-2"
            >
              {/* 卡片封面预览视口 */}
              <button type="button" aria-label={`打开画布：${proj.title}`} aria-description={detail} className={`${assetView ? '!rounded-lg !border-transparent dark:!bg-[#282828]' : ''} w-full aspect-video rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100 dark:bg-[#14171D] overflow-hidden relative shadow-2xs group-hover/card:shadow-md transition-all duration-200`}>
                {proj.studioScene?.nodes.length ? <>
                  <CanvasScenePreview scene={proj.studioScene} />
                  {!compact && !assetView && <span className="absolute bottom-1.5 right-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-black/60 dark:text-slate-300">{detail}</span>}
                </> : <span className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <LayoutGrid aria-hidden="true" className="h-6 w-6" />{!assetView && !compact && detail}
                </span>}
                {cover && <img key={cover} src={cover} loading="lazy" alt=""
                  onError={event => { event.currentTarget.hidden = true; }}
                  className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-300"
                />}
              </button>

              {/* 首页标题叠在封面底部；完整项目列表展示修改日期。 */}
              <div className={compact ? 'absolute inset-x-0 bottom-0 flex items-end justify-between gap-1.5 rounded-b-2xl bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-10 text-white' : 'relative flex items-start justify-between gap-1.5 px-3'}>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  {isEditing ? (
                    <input
                      aria-label="项目名称"
                      maxLength={40}
                      onFocus={event => event.currentTarget.select()}
                      autoFocus
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleSaveRename(proj.id)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing || (e.key !== 'Enter' && e.key !== 'Escape')) return;
                        e.preventDefault();
                        const trigger = editingMenuButton.current;
                        if (e.key === 'Enter') handleSaveRename(proj.id);
                        else setEditingId(null);
                        requestAnimationFrame(() => (trigger?.isConnected ? trigger : searchBox.current)?.focus());
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-xs sm:text-[13px] font-semibold text-slate-900 dark:text-white px-1.5 py-0.5 rounded border border-indigo-400 bg-white dark:bg-[#1B1B1E] focus:outline-none"
                    />
                  ) : (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={`truncate text-xs font-medium transition-colors sm:text-[13px] ${compact ? 'text-white' : 'text-slate-900 dark:text-[#EDEDED] group-hover/card:text-slate-950 dark:group-hover/card:text-white'}`}>
                        {proj.title}
                      </span>
                      {isBuiltIn && <span className="shrink-0 rounded bg-slate-500/15 px-1.5 text-[10px] text-slate-600 dark:text-stone-300">内置演示</span>}
                    </div>
                  )}
                  <span className={`${compact ? 'hidden' : ''} text-[11px] text-slate-600 dark:text-[#8E8E93] font-normal`}>
                    {new Date(proj.updatedAt).toLocaleDateString('zh-CN') + ' 修改'}
                  </span>
                </div>

                {/* 标题右侧横向三点操作按钮 */}
                <div className="relative shrink-0 pt-0.5"
                  onBlur={event => {
                    if (isMenuOpen && !event.currentTarget.contains(event.relatedTarget)) setMenuOpenId(null);
                  }}
                  onKeyDown={event => {
                    if (isMenuOpen && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
                      event.preventDefault();
                      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
                      const index = items.indexOf(document.activeElement as HTMLButtonElement);
                      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1
                        : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
                      items[next]?.focus(); return;
                    }
                    if (event.key !== 'Escape' || !isMenuOpen) return;
                    event.preventDefault();
                    setMenuOpenId(null);
                    event.currentTarget.querySelector('button')?.focus();
                  }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (busyId) return;
                      setMenuOpenId(isMenuOpen ? null : proj.id);
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${compact && !isMenuOpen && !isEditing ? '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 [@media(hover:hover)]:group-focus-within/card:opacity-100' : ''} ${compact ? 'text-white/80 hover:bg-white/15 hover:text-white' : 'text-slate-600 dark:text-[#8E8E93] hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/10'}`}
                    title="更多操作"
                    aria-label={`${proj.title}的更多选项`}
                    aria-expanded={isMenuOpen}
                    aria-haspopup="menu"
                    disabled={!hydrated}
                    aria-disabled={Boolean(busyId)}
                    ref={isEditing ? editingMenuButton : undefined}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {/* 下拉操作菜单 (重命名 / 删除) */}
                  {isMenuOpen && (
                    <div
                      ref={projectMenu}
                      role="menu" aria-label={proj.title+'的操作'}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-full mt-1.5 w-32 p-1 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-slate-100 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_16px_36px_rgba(0,0,0,0.6)] z-30 flex flex-col text-xs text-slate-800 dark:text-[#EDEDED] animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        role="menuitem"
                        type="button"
                        onClick={(e) => handleStartRename(proj, e)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/10 text-left font-medium text-slate-800 dark:text-[#EDEDED] transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-700 dark:text-[#C7C7CC]" />
                        <span>重命名</span>
                      </button>
                      <button type="button" role="menuitem" onClick={e=>void handleDuplicate(proj,e)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/10">
                        <Copy className="h-3.5 w-3.5"/><span>复制项目</span>
                      </button>
                      {!isBuiltIn && <button
                        role="menuitem"
                        type="button"
                        onClick={(e) => handleDelete(proj.id, e)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/10 text-left font-medium text-slate-800 dark:text-[#EDEDED] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-slate-700 dark:text-[#C7C7CC]" />
                        <span>删除</span>
                      </button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {compact || assetView ? <CanvasSaveStatus failuresOnly /> : <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-stone-500">
        <CanvasSaveStatus failuresOnly={compact} />
        <button type="button" disabled={!hydrated}
          className="ml-auto min-h-9 rounded-lg px-2 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50 dark:hover:bg-white/5 dark:hover:text-white"
          onClick={() => setImportOpen(true)}>导入与恢复项目</button>
      </div>}
    </section>
  );
};

export default CanvasRecentProjects;
