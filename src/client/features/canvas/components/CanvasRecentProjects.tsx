import { useCanvasHydrated } from '../hooks/useCanvasHydrated';
import {visibleCanvasProjects} from '../store/canvasProjectDefaults';
import React, { useState, useEffect } from 'react';
import { Plus, MoreHorizontal, Trash2, Edit2, ChevronRight } from 'lucide-react';
import { useCanvasStore } from '../store/useCanvasStore';
import type { CanvasProject } from '../model/types';

interface CanvasRecentProjectsProps {
  onEnterCanvas?: (projectId: string) => void;
  className?: string;
  maxDisplay?: number;
  /** 首页画布模式用独立方卡；画布视图保持网格里的新建入口。 */
  lead?: 'grid' | 'square';
}

export const CanvasRecentProjects: React.FC<CanvasRecentProjectsProps> = ({
  onEnterCanvas,
  className = '',
  maxDisplay = 7,
  lead = 'grid',
}) => {
  const hydrated = useCanvasHydrated();
  const { projects:allProjects, createProject, selectProject, updateProjectTitle, deleteProject } = useCanvasStore();
  const projects=visibleCanvasProjects(allProjects);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
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

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProject(id);
    setMenuOpenId(null);
  };

  const handleCreateNew = () => {
    if (!hydrated) return;
    const newProj = createProject();
    onEnterCanvas?.(newProj.id);
  };

  const handleSelectCard = (id: string) => {
    selectProject(id);
    onEnterCanvas?.(id);
  };

  // 🌟 全屏下一排最多放 8 个（1 个新建项目 + 最多 7 个最近画布）
  const displayedProjects = maxDisplay > 0 ? projects.slice(0, maxDisplay) : projects;
  const hasRecentProjects = projects.length > 0;

  const createCard = lead === 'square' ? (
    <button
      type="button"
      onClick={handleCreateNew}
      className="flex h-[168px] w-[168px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/90 bg-white text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-950 hover:shadow-md"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Plus className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="text-sm font-medium">新建项目</span>
    </button>
  ) : (
    <div
      onClick={handleCreateNew}
      className="group/new flex flex-col gap-2 cursor-pointer transition-all duration-200"
    >
      <div className="w-full aspect-video rounded-2xl border border-slate-200/80 bg-slate-100/70 hover:bg-slate-200/70 hover:border-slate-300 flex items-center justify-center transition-all duration-200 shadow-2xs group-hover/new:shadow-md group-hover/new:-translate-y-0.5">
        <div className="w-10 h-10 rounded-full bg-white/80 shadow-2xs flex items-center justify-center text-slate-400 group-hover/new:text-slate-900 group-hover/new:scale-110 transition-all duration-200">
          <Plus className="w-6 h-6 stroke-[2.2]" />
        </div>
      </div>
      <div className="px-1">
        <span className="text-xs sm:text-[13px] font-semibold text-slate-800 group-hover/new:text-slate-950 transition-colors">
          新建项目
        </span>
      </div>
    </div>
  );

  return (
    <section className={`w-full space-y-4 select-none ${className}`}>
      {lead === 'square' && createCard}
      {/* 空画布不展示“最近项目 · 0 个画布”的无效标题行，直接给出新建入口。 */}
      {hasRecentProjects && (
        <div className="flex items-center justify-between pb-1 border-b border-slate-200/50">
          <div className="flex items-center gap-2 py-1">
            <span className="text-base font-bold text-slate-900 tracking-tight">
              最近项目
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium font-mono">
              {projects.length} 个画布
            </span>
          </div>

          {projects.length > maxDisplay && (
            <button
              type="button"
              onClick={() => {
                if (projects[0]) {
                  handleSelectCard(projects[0].id);
                } else {
                  handleCreateNew();
                }
              }}
              className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-0.5 transition-colors cursor-pointer"
            >
              进入画板查看全部
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {(lead === 'grid' || hasRecentProjects) && (
      <div className="grid grid-cols-1 min-[540px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        {lead === 'grid' && createCard}

        {/* 🌟 历史画布卡片 */}
        {displayedProjects.map((proj) => {
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
              <div className="w-full aspect-video rounded-2xl border border-slate-200/80 bg-slate-100 overflow-hidden relative shadow-2xs group-hover/card:shadow-md group-hover/card:-translate-y-0.5 transition-all duration-200">
                {proj.thumbnail ? (
                  <img
                    src={proj.thumbnail}
                    alt={proj.title}
                    className="w-full h-full object-cover object-center group-hover/card:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-[#eaecef] transition-colors" />
                )}
              </div>

              {/* 卡片底部标题行与右侧三点操作 */}
              <div className="px-1 flex items-start justify-between gap-1.5 relative">
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleSaveRename(proj.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(proj.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-xs sm:text-[13px] font-semibold text-slate-900 px-1.5 py-0.5 rounded border border-indigo-400 bg-white focus:outline-none"
                    />
                  ) : (
                    <span className="text-xs sm:text-[13px] font-bold text-slate-900 group-hover/card:text-slate-950 truncate transition-colors">
                      {proj.title}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-600 font-normal">
                    {proj.subtitle || '画布 · 刚刚修改'}
                  </span>
                </div>

                {/* 标题右侧横向三点操作按钮 */}
                <div className="relative shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(isMenuOpen ? null : proj.id);
                    }}
                    className="w-6 h-6 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100/80 flex items-center justify-center transition-colors"
                    title="更多操作"
                    aria-label="项目更多选项"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {/* 下拉操作菜单 (重命名 / 删除) */}
                  {isMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-full mt-1.5 w-32 p-1 rounded-2xl bg-white border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-30 flex flex-col text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(proj, e)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 text-left font-medium text-slate-800 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-700" />
                        <span>重命名</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(proj.id, e)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 text-left font-medium text-slate-800 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-slate-700" />
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
