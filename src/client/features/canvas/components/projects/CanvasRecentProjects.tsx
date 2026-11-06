import { CanvasArchiveDialog } from './CanvasArchiveDialog';
import { CanvasScenePreview } from './CanvasScenePreview';
import { filterCanvasProjects } from '../../model/canvasProjectListing';
import { CanvasCreateDialog } from './CanvasCreateDialog';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { useCanvasHydrated } from '../../hooks/useCanvasHydrated';
import {studioCover, visibleCanvasProjects} from '../../store/canvasProjectDefaults';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, MoreHorizontal, Trash2, Edit2, ChevronRight, LayoutGrid } from 'lucide-react';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasProject } from '../../model/types';
import { videoWorkflowTemplates } from '../../model/videoWorkflowProjects';

interface CanvasRecentProjectsProps {
  onEnterCanvas?: (projectId: string) => void;
  className?: string;
  maxDisplay?: number;
  compact?: boolean;
  assetView?: boolean;
  onOpenAll?: () => void;
}

export const CanvasRecentProjects: React.FC<CanvasRecentProjectsProps> = ({
  onEnterCanvas,
  className = '',
  maxDisplay = 7,
  compact = false,
  assetView = false,
  onOpenAll,
}) => {
  const hydrated = useCanvasHydrated();
  const { projects:allProjects, createProject, selectProject, updateProjectTitle, deleteProject } = useCanvasStore();
  const projects=useMemo(()=>visibleCanvasProjects(allProjects),[allProjects]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editingMenuButton = useRef<HTMLButtonElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

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
    setMenuOpenId(null);
    const project = allProjects.find(item => item.id === id);
    if (project && await confirmAction({
      title:'删除画布项目', description:`删除「${project.title}」及其中的节点和连线？此操作无法撤销。`,
      confirmText:'删除项目', cancelText:'取消', danger:true,
    })) deleteProject(id);
  };

  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleSelectCard = (id: string) => {
    selectProject(id);
    onEnterCanvas?.(id);
  };

  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const search = query.trim().toLocaleLowerCase();
  const filtered = filterCanvasProjects(projects, { query, order: 'updated', period: 'all' });
  const displayedProjects = !search && maxDisplay > 0 && !showAll ? filtered.slice(0, maxDisplay) : filtered;
  const hasRecentProjects = projects.length > 0;

  const createCard = (
    <button
      type="button"
      disabled={!hydrated}
      onClick={() => setCreating(true)}
      className={`disabled:cursor-wait disabled:opacity-60 flex ${hasRecentProjects ? 'h-16 w-full sm:h-auto sm:aspect-video sm:flex-col' : 'h-[168px] w-[168px] flex-col'} items-center justify-center gap-3 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#1B1B1E] text-slate-500 dark:text-[#8E8E93] shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-white/20 hover:text-slate-950 dark:hover:text-white hover:shadow-md`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-[#E5E5EA]">
        <Plus className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="text-sm font-medium">新建画布</span>
    </button>
  );

  return (
    <section className={`w-full space-y-4 select-none ${className}`}>
      {importing && <CanvasArchiveDialog mode="import" onClose={() => setImporting(false)} onRestored={project => handleSelectCard(project.id)} />}
      {!compact && <button type="button" disabled={!hydrated} onClick={() => setImporting(true)}>导入项目备份</button>}
      {creating && <CanvasCreateDialog onClose={() => setCreating(false)} onCreate={kind => {
        const project = createProject(undefined, kind);
        setCreating(false);
        onEnterCanvas?.(project.id);
      }} />}
      {compact && onOpenAll && <button type="button" onClick={onOpenAll}>全部</button>}
      {!assetView && <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500 dark:text-slate-400">复刻流程模板</span>
        {videoWorkflowTemplates.map(template => <button key={template.kind} type="button" disabled={!hydrated}
          title={template.summary} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          onClick={() => { const project = createProject(undefined, template.kind); onEnterCanvas?.(project.id); }}>
          {template.title}
        </button>)}
        <span className="text-xs text-slate-500">W3 支持从四项素材生成 15 秒无声成片</span>
      </div>}
      {!hasRecentProjects && createCard}
      {!hydrated && <p role="status" className="text-sm text-slate-500">正在读取本地项目…</p>}
      {/* 空画布不展示“最近项目 · 0 个画布”的无效标题行，直接给出新建入口。 */}
      {hasRecentProjects && (
        <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-slate-200/50 dark:border-white/10">
          <div className="flex items-center gap-2 py-1">
            <span className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
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

      {search && hasRecentProjects && !displayedProjects.length && <p role="status" className="text-sm text-slate-500">没有找到匹配的项目</p>}
      {hasRecentProjects && (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,168px),1fr))] items-start gap-4 sm:gap-5">
        {createCard}
        {displayedProjects.map((proj) => {
          const cover = studioCover(proj.studioScene) || proj.thumbnail;
          const nodeCount = proj.studioScene?.nodes.length ?? proj.nodes.length;
          const detail = nodeCount ? `${nodeCount} 个节点` : proj.studioScene?.strokes?.length ? '手绘画布' : proj.studioScene?.textBoxes?.length ? '文本画布' : '项目画布';
          const isEditing = editingId === proj.id;
          const isMenuOpen = menuOpenId === proj.id;

          return (
            <div
              key={proj.id}
              onClick={() => {
                if (!isEditing) handleSelectCard(proj.id);
              }}
              className="group/card flex flex-col gap-2 cursor-pointer transition-all duration-200 relative"
            >
              {/* 卡片封面预览视口 */}
              <button type="button" aria-label={`打开画布：${proj.title}`} className="w-full aspect-video rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100 dark:bg-[#14171D] overflow-hidden relative shadow-2xs group-hover/card:shadow-md group-hover/card:-translate-y-0.5 transition-all duration-200">
                <span className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <LayoutGrid aria-hidden="true" className="h-6 w-6" />{detail}
                </span>
                {!cover && <CanvasScenePreview scene={proj.studioScene} />}
                {cover && <img key={cover} src={cover} loading="lazy" alt=""
                  onError={event => { event.currentTarget.hidden = true; }}
                  className="absolute inset-0 w-full h-full object-cover object-center group-hover/card:scale-105 transition-transform duration-300"
                />}
              </button>

              {/* 卡片底部标题行与右侧三点操作 */}
              <div className="px-1 flex items-start justify-between gap-1.5 relative">
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  {isEditing ? (
                    <input
                      aria-label="项目名称"
                      maxLength={40}
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
                    <span className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-[#EDEDED] group-hover/card:text-slate-950 dark:group-hover/card:text-white truncate transition-colors">
                      {proj.title}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-600 dark:text-[#8E8E93] font-normal">
                    {'画布 · ' + new Date(proj.updatedAt).toLocaleDateString()}
                  </span>
                </div>

                {/* 标题右侧横向三点操作按钮 */}
                <div className="relative shrink-0 pt-0.5"
                  onBlur={event => {
                    if (isMenuOpen && !event.currentTarget.contains(event.relatedTarget)) setMenuOpenId(null);
                  }}
                  onKeyDown={event => {
                    if (event.key !== 'Escape' || !isMenuOpen) return;
                    event.preventDefault();
                    setMenuOpenId(null);
                    event.currentTarget.querySelector('button')?.focus();
                  }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(isMenuOpen ? null : proj.id);
                    }}
                    className="w-6 h-6 rounded-lg text-slate-600 dark:text-[#8E8E93] hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
                    title="更多操作"
                    aria-label="项目更多选项"
                    aria-expanded={isMenuOpen}
                    ref={isEditing ? editingMenuButton : undefined}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {/* 下拉操作菜单 (重命名 / 删除) */}
                  {isMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-full mt-1.5 w-32 p-1 rounded-2xl bg-white dark:bg-[#1B1B1E] border border-slate-100 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_16px_36px_rgba(0,0,0,0.6)] z-30 flex flex-col text-xs text-slate-800 dark:text-[#EDEDED] animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(proj, e)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/10 text-left font-medium text-slate-800 dark:text-[#EDEDED] transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-700 dark:text-[#C7C7CC]" />
                        <span>重命名</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(proj.id, e)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/10 text-left font-medium text-slate-800 dark:text-[#EDEDED] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-slate-700 dark:text-[#C7C7CC]" />
                        <span>删除</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
};

export default CanvasRecentProjects;
